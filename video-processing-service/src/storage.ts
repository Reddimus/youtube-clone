import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { Storage } from "@google-cloud/storage";

import { defaultRawVideoBucketName } from "./pubsub";

const storage = new Storage();

const rawVideoBucketName =
  process.env.RAW_VIDEO_BUCKET ?? defaultRawVideoBucketName;
const processedVideoBucketName =
  process.env.PROCESSED_VIDEO_BUCKET ?? "redd-processed-videos";
export const maxUploadBytes = 250 * 1024 * 1024;

const localRawVideoPath = path.resolve("raw-videos");
const localProcessedVideoPath = path.resolve("processed-videos");
const safeVideoNamePattern = /^[A-Za-z0-9_~-]+\.(?:mp4|mov|webm|m4v)$/i;

function localVideoPath(directory: string, fileName: string): string {
  if (!safeVideoNamePattern.test(fileName) || path.basename(fileName) !== fileName) {
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

export async function setupDirectories(): Promise<void> {
  await Promise.all([
    mkdir(localRawVideoPath, { recursive: true }),
    mkdir(localProcessedVideoPath, { recursive: true }),
  ]);
}

export function convertVideo(
  rawVideoName: string,
  processedVideoName: string,
): Promise<void> {
  const inputPath = localVideoPath(localRawVideoPath, rawVideoName);
  const outputPath = localVideoPath(localProcessedVideoPath, processedVideoName);

  return new Promise((resolve, reject) => {
    execFile(
      "ffmpeg",
      [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        inputPath,
        "-vf",
        "scale=-2:360",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        outputPath,
      ],
      {
        maxBuffer: 10 * 1024 * 1024,
        timeout: 55 * 60 * 1000,
        killSignal: "SIGKILL",
      },
      (error) => {
        if (error) {
          reject(new Error("FFmpeg failed to transcode the video.", { cause: error }));
          return;
        }

        resolve();
      },
    );
  });
}

export async function downloadRawVideo(fileName: string): Promise<void> {
  const destination = localVideoPath(localRawVideoPath, fileName);
  const file = storage.bucket(rawVideoBucketName).file(fileName);
  const [metadata] = await file.getMetadata();
  validateRawVideoSize(metadata.size);

  await file.download({ destination });
}

export async function uploadProcessedVideo(fileName: string): Promise<void> {
  const source = localVideoPath(localProcessedVideoPath, fileName);
  const bucket = storage.bucket(processedVideoBucketName);

  await bucket.upload(source, {
    destination: fileName,
    metadata: { contentType: "video/mp4" },
  });
  await bucket.file(fileName).makePublic();
}

export function deleteRawVideo(fileName: string): Promise<void> {
  return rm(localVideoPath(localRawVideoPath, fileName), { force: true });
}

export function deleteProcessedVideo(fileName: string): Promise<void> {
  return rm(localVideoPath(localProcessedVideoPath, fileName), { force: true });
}
