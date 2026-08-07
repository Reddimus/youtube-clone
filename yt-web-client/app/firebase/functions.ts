import { httpsCallable } from "firebase/functions";

import { getFirebaseFunctions } from "./firebase";

const allowedVideoExtensions = new Set(["mp4", "mov", "webm", "m4v"]);

interface GenerateUploadUrlRequest {
  fileExtension: string;
  fileSize: number;
}

interface GenerateUploadUrlResponse {
  url: string;
  fields: Record<string, string>;
  fileName: string;
  maxUploadBytes: number;
}

export const maxUploadBytes = 250 * 1024 * 1024;

export interface Video {
  id: string;
  filename?: string;
  title?: string;
  description?: string;
}

export function getVideoExtension(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (!extension || !allowedVideoExtensions.has(extension)) {
    throw new Error("Choose an MP4, MOV, WebM, or M4V video file.");
  }

  return extension;
}

export function validateVideoFileSize(size: number): void {
  if (!Number.isSafeInteger(size) || size < 1 || size > maxUploadBytes) {
    throw new Error("Choose a non-empty video no larger than 250 MiB.");
  }
}

export function isSafeProcessedVideoName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^processed-(?:u~[A-Za-z0-9_-]+~\d{13}~[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|[A-Za-z0-9_-]{1,128}-\d{13})\.(?:mp4|mov|webm|m4v)$/i.test(
      value,
    )
  );
}

export async function uploadVideo(file: File): Promise<Response> {
  validateVideoFileSize(file.size);
  const generateUploadUrl = httpsCallable<
    GenerateUploadUrlRequest,
    GenerateUploadUrlResponse
  >(getFirebaseFunctions(), "generateUploadUrl");
  const response = await generateUploadUrl({
    fileExtension: getVideoExtension(file.name),
    fileSize: file.size,
  });

  if (response.data.maxUploadBytes < file.size) {
    throw new Error("The video exceeds the server upload limit.");
  }

  const formData = new FormData();
  for (const [name, value] of Object.entries(response.data.fields)) {
    formData.append(name, value);
  }
  formData.append("file", file, file.name);

  const uploadResult = await fetch(response.data.url, {
    method: "POST",
    body: formData,
    cache: "no-store",
  });

  if (!uploadResult.ok) {
    throw new Error(`Video upload failed with status ${uploadResult.status}.`);
  }

  return uploadResult;
}

export async function getVideos(): Promise<Video[]> {
  const getVideosFunction = httpsCallable<void, Video[]>(
    getFirebaseFunctions(),
    "getVideos",
  );
  const response = await getVideosFunction();
  return response.data;
}
