import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { Storage } from "@google-cloud/storage";
import {
  isSafeLocalVideoName,
  isSafeProcessedVideoName,
  maxUploadBytes,
  videoRenditions,
} from "@yt/contract";

import type { ProcessingAttempt } from "./claims";
import type { VideoOutputFile } from "./pubsub";

const processMaxBufferBytes = 10 * 1024 * 1024;
const processTimeoutMilliseconds = 55 * 60 * 1000;
const storageRequestTimeoutMilliseconds = 4 * 60 * 1000;

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
    attempt: ProcessingAttempt,
  ) => Promise<VideoOutputFile[]>;
  downloadRawVideo: (
    fileName: string,
    attempt: ProcessingAttempt,
  ) => Promise<void>;
  uploadProcessedVideo: (
    fileName: string,
    attempt: ProcessingAttempt,
  ) => Promise<void>;
  deletePublishedVideo: (
    fileName: string,
    attempt: ProcessingAttempt,
  ) => Promise<void>;
  deleteRawVideo: (
    fileName: string,
    attempt: ProcessingAttempt,
  ) => Promise<void>;
  deleteProcessedVideo: (
    fileName: string,
    attempt: ProcessingAttempt,
  ) => Promise<void>;
}

export class PermanentProcessingError extends Error {
  override readonly name = "PermanentProcessingError";
}

function validateProcessingAttempt(attempt: ProcessingAttempt): void {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(attempt.claimToken)) {
    throw new PermanentProcessingError(
      "The processing claim token is unusable.",
    );
  }
}

function localVideoPath(
  directory: string,
  fileName: string,
  attempt: ProcessingAttempt,
): string {
  validateProcessingAttempt(attempt);
  return safeVideoPath(path.join(directory, attempt.claimToken), fileName);
}

function safeVideoPath(directory: string, fileName: string): string {
  if (!isSafeLocalVideoName(fileName) || path.basename(fileName) !== fileName) {
    throw new PermanentProcessingError("The video object name is unusable.");
  }

  return path.join(directory, fileName);
}

function remainingMilliseconds(attempt: ProcessingAttempt): number {
  const remaining = attempt.deadlineMilliseconds - Date.now();
  if (remaining <= 0) {
    throw new Error("The video processing attempt timed out.");
  }

  return remaining;
}

function boundedStorageTimeout(attempt: ProcessingAttempt): number {
  return Math.min(
    storageRequestTimeoutMilliseconds,
    remainingMilliseconds(attempt),
  );
}

function processOptions(attempt: ProcessingAttempt) {
  return {
    encoding: "utf8" as const,
    killSignal: "SIGKILL" as const,
    maxBuffer: processMaxBufferBytes,
    timeout: Math.min(
      processTimeoutMilliseconds,
      remainingMilliseconds(attempt),
    ),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProcessTimeout(error: Error): boolean {
  return (
    error.name === "AbortError" || ("killed" in error && error.killed === true)
  );
}

function isProcessInputRejection(error: Error): boolean {
  return "code" in error && typeof error.code === "number";
}

export function validateRawVideoSize(value: unknown): number {
  const size = Number(value);
  if (!Number.isSafeInteger(size) || size < 1 || size > maxUploadBytes) {
    throw new PermanentProcessingError(
      "The raw video exceeds the processing size limit.",
    );
  }

  return size;
}

function probeDisplayedVideoHeight(
  inputPath: string,
  attempt: ProcessingAttempt,
): Promise<number> {
  return new Promise((resolve, reject) => {
    execFile(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height:stream_side_data=rotation",
        "-of",
        "json",
        inputPath,
      ],
      processOptions(attempt),
      (error, stdout) => {
        if (error) {
          if (isProcessTimeout(error)) {
            reject(
              new Error(
                "FFprobe timed out while inspecting the source video.",
                {
                  cause: error,
                },
              ),
            );
            return;
          }
          if (isProcessInputRejection(error)) {
            reject(
              new PermanentProcessingError(
                "FFprobe rejected the source as invalid media.",
                { cause: error },
              ),
            );
            return;
          }
          reject(
            new Error("FFprobe failed to inspect the source video.", {
              cause: error,
            }),
          );
          return;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(stdout) as unknown;
        } catch {
          reject(
            new PermanentProcessingError(
              "FFprobe found no usable video stream.",
            ),
          );
          return;
        }

        const streams: unknown[] =
          isRecord(parsed) && Array.isArray(parsed.streams)
            ? (parsed.streams as unknown[])
            : [];
        const stream = streams[0];
        if (!isRecord(stream)) {
          reject(
            new PermanentProcessingError(
              "FFprobe found no usable video stream.",
            ),
          );
          return;
        }

        const width = stream.width;
        const height = stream.height;
        if (
          !Number.isSafeInteger(width) ||
          !Number.isSafeInteger(height) ||
          Number(width) < 1 ||
          Number(height) < 1
        ) {
          reject(
            new PermanentProcessingError(
              "FFprobe found no usable video stream.",
            ),
          );
          return;
        }

        const sideData: unknown[] = Array.isArray(stream.side_data_list)
          ? (stream.side_data_list as unknown[])
          : [];
        const rotation = sideData.find(
          (entry): entry is Record<string, unknown> =>
            isRecord(entry) && typeof entry.rotation === "number",
        )?.rotation;
        const normalizedRotation =
          typeof rotation === "number" ? ((rotation % 360) + 360) % 360 : 0;
        const displayedHeight =
          normalizedRotation === 90 || normalizedRotation === 270
            ? Number(width)
            : Number(height);

        resolve(displayedHeight);
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
      "-pix_fmt",
      "yuv420p",
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
      safeVideoPath(processedVideoDirectory, output.fileName),
    );
  }

  return argumentsList;
}

function runFfmpeg(
  argumentsList: readonly string[],
  attempt: ProcessingAttempt,
): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile("ffmpeg", argumentsList, processOptions(attempt), (error) => {
      if (error) {
        if (isProcessTimeout(error)) {
          reject(
            new Error("FFmpeg timed out while transcoding the video.", {
              cause: error,
            }),
          );
          return;
        }
        if (isProcessInputRejection(error)) {
          reject(
            new PermanentProcessingError("FFmpeg rejected the input video.", {
              cause: error,
            }),
          );
          return;
        }
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
  const storage = new Storage({
    retryOptions: {
      totalTimeout: storageRequestTimeoutMilliseconds / 1_000,
    },
    timeout: storageRequestTimeoutMilliseconds,
  });
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

    convertVideo: async (rawVideoName, outputFileNames, attempt) => {
      const inputPath = localVideoPath(
        localRawVideoPath,
        rawVideoName,
        attempt,
      );
      const sourceHeight = await probeDisplayedVideoHeight(inputPath, attempt);
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
          path.join(localProcessedVideoPath, attempt.claimToken),
        ),
        attempt,
      );
      return outputs;
    },

    downloadRawVideo: async (fileName, attempt) => {
      const destination = localVideoPath(localRawVideoPath, fileName, attempt);
      await Promise.all([
        mkdir(path.dirname(destination), { recursive: true }),
        mkdir(path.join(localProcessedVideoPath, attempt.claimToken), {
          recursive: true,
        }),
      ]);
      const file = storage.bucket(config.rawVideoBucketName).file(fileName);
      const [metadata] = await file.getMetadata();
      validateRawVideoSize(metadata.size);
      remainingMilliseconds(attempt);

      await file.download({ destination });
    },

    uploadProcessedVideo: async (fileName, attempt) => {
      const source = localVideoPath(localProcessedVideoPath, fileName, attempt);
      const bucket = storage.bucket(config.processedVideoBucketName);
      let uploaded = false;

      try {
        await bucket.upload(source, {
          destination: fileName,
          metadata: { contentType: "video/mp4" },
          timeout: boundedStorageTimeout(attempt),
        });
        uploaded = true;
        remainingMilliseconds(attempt);
        await bucket.file(fileName).makePublic();
      } catch (error) {
        if (uploaded) {
          await bucket
            .file(fileName)
            .delete({ ignoreNotFound: true })
            .catch(() => {
              // The request remains failed; a retry can safely overwrite this name.
            });
        }
        throw error;
      }
    },

    deletePublishedVideo: async (fileName, attempt) => {
      validateProcessingAttempt(attempt);
      if (!isSafeProcessedVideoName(fileName)) {
        throw new PermanentProcessingError(
          "The processed video object name is unusable.",
        );
      }
      remainingMilliseconds(attempt);
      await storage
        .bucket(config.processedVideoBucketName)
        .file(fileName)
        .delete({ ignoreNotFound: true });
    },

    deleteRawVideo: (fileName, attempt) => {
      return rm(localVideoPath(localRawVideoPath, fileName, attempt), {
        force: true,
      });
    },

    deleteProcessedVideo: (fileName, attempt) => {
      return rm(localVideoPath(localProcessedVideoPath, fileName, attempt), {
        force: true,
      });
    },
  };
}
