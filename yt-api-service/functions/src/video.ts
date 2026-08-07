import { randomUUID } from "node:crypto";

const allowedVideoExtensions = new Set(["mp4", "mov", "webm", "m4v"]);
const contentTypesByExtension: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  m4v: "video/x-m4v",
};
const uploadIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const maxUploadBytes = 250 * 1024 * 1024;

export interface PublicVideo {
  id: string;
  filename?: string;
  title?: string;
  description?: string;
}

export function normalizeVideoExtension(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("A video file extension is required.");
  }

  const extension = value.trim().toLowerCase();
  if (!allowedVideoExtensions.has(extension)) {
    throw new Error("The video extension must be mp4, mov, webm, or m4v.");
  }

  return extension;
}

export function contentTypeForVideoExtension(extension: string): string {
  return contentTypesByExtension[normalizeVideoExtension(extension)];
}

export function normalizeUploadSize(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > maxUploadBytes
  ) {
    throw new Error(`The video must be between 1 byte and ${maxUploadBytes} bytes.`);
  }

  return value;
}

/** Encodes an arbitrary Firebase UID into a storage-safe, reversible segment. */
export function encodeUserId(uid: string): string {
  if (!uid || Buffer.byteLength(uid, "utf8") > 128) {
    throw new Error("The authenticated user ID is invalid.");
  }

  return Buffer.from(uid, "utf8").toString("base64url");
}

export function createRawVideoFileName(
  uid: string,
  extension: string,
  timestamp = Date.now(),
  uploadId = randomUUID(),
): string {
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp < 1_000_000_000_000 ||
    timestamp > 9_999_999_999_999
  ) {
    throw new Error("The upload timestamp is invalid.");
  }

  if (!uploadIdPattern.test(uploadId)) {
    throw new Error("The upload ID is invalid.");
  }

  return `u~${encodeUserId(uid)}~${timestamp}~${uploadId}.${normalizeVideoExtension(extension)}`;
}

/** Whitelists fields that are safe to expose from the public video feed. */
export function toPublicVideo(
  id: string,
  storedVideo: Record<string, unknown>,
): PublicVideo {
  const video: PublicVideo = { id };

  if (typeof storedVideo.filename === "string") {
    video.filename = storedVideo.filename;
  }
  if (typeof storedVideo.title === "string") {
    video.title = storedVideo.title;
  }
  if (typeof storedVideo.description === "string") {
    video.description = storedVideo.description;
  }

  return video;
}
