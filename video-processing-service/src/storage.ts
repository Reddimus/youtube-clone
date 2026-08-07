import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { Storage } from "@google-cloud/storage";
import {
  isSafeLocalVideoName,
  maxUploadBytes,
  videoRenditions,
} from "@yt/contract";

import type { VideoOutputFile } from "./pubsub";

const processMaxBufferBytes = 10 * 1024 * 1024;
const processTimeoutMilliseconds = 55 * 60 * 1000;
const processOptions = {
  encoding: "utf8" as const,
  killSignal: "SIGKILL" as const,
  maxBuffer: processMaxBufferBytes,
  timeout: processTimeoutMilliseconds,
};

export interface VideoStorageConfig {
  processedVideoBucketName: string;
  rawVideoBucketName: string;
  workDir: string;
}

export interface VideoStorage {
  setupDirectories: () => Promise<void>;
  convertVideo: (
    rawVideoName: string,
    outputFileNames: readonly VideoOutputFile[],
  ) => Promise<VideoOutputFile[]>;
  downloadRawVideo: (fileName: string) => Promise<void>;
  uploadProcessedVideo: (fileName: string) => Promise<void>;
  deleteRawVideo: (fileName: string) => Promise<void>;
  deleteProcessedVideo: (fileName: string) => Promise<void>;
}

function localVideoPath(directory: string, fileName: string): string {
  if (!isSafeLocalVideoName(fileName) || path.basename(fileName) !== fileName) {
    throw new Error("Unsafe video file name.");
  }

  return path.join(directory, fileName);
}

export function validateRawVideoSize(value: unknown): number {
  const size = Number(value);
  if (!Number.isSafeInteger(size) || size < 1 || size > maxUploadBytes) {
    throw new Error("The raw video exceeds the processing size limit.");
  }

  return size;
}

function probeVideoHeight(inputPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    execFile(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=height",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        inputPath,
      ],
      processOptions,
      (error, stdout) => {
        if (error) {
          reject(
            new Error("FFprobe failed to inspect the source video.", {
              cause: error,
            }),
          );
          return;
        }

        const height = Number(stdout.trim());
        if (!Number.isSafeInteger(height) || height < 1) {
          reject(new Error("FFprobe returned an invalid source video height."));
          return;
        }

        resolve(height);
      },
    );
  });
}

function ffmpegArguments(
  inputPath: string,
  sourceHeight: number,
  outputFileNames: readonly VideoOutputFile[],
  processedVideoDirectory: string,
): string[] {
  const selectedRenditions = videoRenditions.filter(
    (rendition) => rendition.height <= sourceHeight,
  );
  const renditions =
    selectedRenditions.length > 0 ? selectedRenditions : [videoRenditions[0]];
  const selectedOutputs = renditions.map((rendition) => {
    const output = outputFileNames.find(
      (candidate) => candidate.rendition === rendition.name,
    );
    if (!output) {
      throw new Error(`Missing output file for rendition ${rendition.name}.`);
    }

    return { output, rendition };
  });
  const splitLabels = selectedOutputs
    .map((_output, index) => `[split${index}]`)
    .join("");
  const filters = [
    `[0:v]split=${selectedOutputs.length}${splitLabels}`,
    ...selectedOutputs.map(
      ({ rendition }, index) =>
        `[split${index}]scale=-2:min(${rendition.height}\\,ih)[video${index}]`,
    ),
  ].join(";");
  const argumentsList = [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-filter_complex",
    filters,
  ];

  for (const [index, { output, rendition }] of selectedOutputs.entries()) {
    const bitrate = `${rendition.maxBitrateKbps}k`;
    argumentsList.push(
      "-map",
      `[video${index}]`,
      "-map",
      "0:a?",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-b:v",
      bitrate,
      "-maxrate",
      bitrate,
      "-bufsize",
      `${rendition.maxBitrateKbps * 2}k`,
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      localVideoPath(processedVideoDirectory, output.fileName),
    );
  }

  return argumentsList;
}

function runFfmpeg(argumentsList: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("ffmpeg", argumentsList, processOptions, (error) => {
      if (error) {
        reject(
          new Error("FFmpeg failed to transcode the video.", { cause: error }),
        );
        return;
      }

      resolve();
    });
  });
}

export function createVideoStorage(config: VideoStorageConfig): VideoStorage {
  const storage = new Storage();
  const localRawVideoPath = path.resolve(config.workDir, "raw-videos");
  const localProcessedVideoPath = path.resolve(
    config.workDir,
    "processed-videos",
  );

  return {
    setupDirectories: async () => {
      await Promise.all([
        mkdir(localRawVideoPath, { recursive: true }),
        mkdir(localProcessedVideoPath, { recursive: true }),
      ]);
    },

    convertVideo: async (rawVideoName, outputFileNames) => {
      const inputPath = localVideoPath(localRawVideoPath, rawVideoName);
      const sourceHeight = await probeVideoHeight(inputPath);
      const selectedOutputs = outputFileNames.filter((output) => {
        const rendition = videoRenditions.find(
          (candidate) => candidate.name === output.rendition,
        );
        return rendition !== undefined && rendition.height <= sourceHeight;
      });
      const outputs =
        selectedOutputs.length > 0
          ? selectedOutputs
          : outputFileNames.filter(
              (output) => output.rendition === videoRenditions[0].name,
            );
      if (outputs.length === 0) {
        throw new Error("The smallest rendition output file is missing.");
      }

      await runFfmpeg(
        ffmpegArguments(
          inputPath,
          sourceHeight,
          outputFileNames,
          localProcessedVideoPath,
        ),
      );
      return outputs;
    },

    downloadRawVideo: async (fileName) => {
      const destination = localVideoPath(localRawVideoPath, fileName);
      const file = storage.bucket(config.rawVideoBucketName).file(fileName);
      const [metadata] = await file.getMetadata();
      validateRawVideoSize(metadata.size);

      await file.download({ destination });
    },

    uploadProcessedVideo: async (fileName) => {
      const source = localVideoPath(localProcessedVideoPath, fileName);
      const bucket = storage.bucket(config.processedVideoBucketName);

      await bucket.upload(source, {
        destination: fileName,
        metadata: { contentType: "video/mp4" },
      });
      await bucket.file(fileName).makePublic();
    },

    deleteRawVideo: (fileName) => {
      return rm(localVideoPath(localRawVideoPath, fileName), { force: true });
    },

    deleteProcessedVideo: (fileName) => {
      return rm(localVideoPath(localProcessedVideoPath, fileName), {
        force: true,
      });
    },
  };
}
