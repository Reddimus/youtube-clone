/**
 * The upload and processing contract shared by every service.
 *
 * This entry point is isomorphic: it must stay free of Node-only globals so the
 * browser bundle can import it. Node-only helpers (UID encoding, raw-video name
 * construction and parsing) live in `@yt/contract/server`.
 */

export const maxUploadBytes = 250 * 1024 * 1024;

export const allowedVideoExtensions = ["mp4", "mov", "webm", "m4v"] as const;

export type VideoExtension = (typeof allowedVideoExtensions)[number];

export const contentTypesByExtension: Readonly<Record<VideoExtension, string>> =
  Object.freeze({
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    m4v: "video/x-m4v",
  });

const extensionLookup = new Set<string>(allowedVideoExtensions);
const extensionAlternation = allowedVideoExtensions.join("|");

/**
 * Renditions emitted by the processor, ordered smallest first.
 *
 * `height` drives the ffmpeg scale filter; `maxBitrateKbps` caps each output so
 * a pathological source cannot blow the Cloud Run memory budget.
 */
export const videoRenditions = [
  { name: "360p", height: 360, maxBitrateKbps: 800 },
  { name: "720p", height: 720, maxBitrateKbps: 2500 },
] as const;

export type VideoRendition = (typeof videoRenditions)[number];
export type RenditionName = VideoRendition["name"];

export const defaultRenditionName: RenditionName = "360p";

const renditionAlternation = videoRenditions
  .map((rendition) => rendition.name)
  .join("|");

/** Uploaded object names: `u~<base64url uid>~<13-digit ms>~<uuidv4>.<ext>`. */
const uploadIdSource =
  "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

export const uploadIdPattern = new RegExp(`^${uploadIdSource}$`, "i");

export const rawVideoNamePattern = new RegExp(
  `^u~([A-Za-z0-9_-]+)~(\\d{13})~(${uploadIdSource})\\.(${extensionAlternation})$`,
  "i",
);

/** Pre-2026 uploads used `<uid>-<13-digit ms>.<ext>` and must keep resolving. */
export const legacyRawVideoNamePattern = new RegExp(
  `^([A-Za-z0-9_-]{1,128})-(\\d{13})\\.(${extensionAlternation})$`,
  "i",
);

const videoIdSource = `(?:u~[A-Za-z0-9_-]+~\\d{13}~${uploadIdSource}|[A-Za-z0-9_-]{1,128}-\\d{13})`;

/**
 * Processed object names.
 *
 * Two shapes are accepted on purpose. Videos processed before the rendition
 * ladder shipped are stored as `processed-<videoId>.mp4` with no suffix, and
 * those documents still exist in Firestore. New videos carry an explicit
 * `-<rendition>` suffix.
 */
export const processedVideoNamePattern = new RegExp(
  `^processed-${videoIdSource}(?:-(?:${renditionAlternation}))?\\.(${extensionAlternation})$`,
  "i",
);

/** Guards every local filesystem path the processor touches. */
export const safeLocalVideoNamePattern = new RegExp(
  `^[A-Za-z0-9_~-]+\\.(?:${extensionAlternation})$`,
  "i",
);

export interface PublicVideo {
  id: string;
  filename?: string;
  title?: string;
  description?: string;
  renditions?: RenditionName[];
  uploadedAt?: number;
}

/** Orders renditions smallest-first by their real pixel height. */
export function sortRenditionsByHeight(
  renditions: readonly RenditionName[],
): RenditionName[] {
  const heightOf = (name: RenditionName): number =>
    videoRenditions.find((rendition) => rendition.name === name)?.height ?? 0;

  return [...renditions].sort((a, b) => heightOf(a) - heightOf(b));
}

export function isVideoExtension(value: unknown): value is VideoExtension {
  return typeof value === "string" && extensionLookup.has(value);
}

export function normalizeVideoExtension(value: unknown): VideoExtension {
  if (typeof value !== "string") {
    throw new Error("A video file extension is required.");
  }

  const extension = value.trim().toLowerCase();
  if (!isVideoExtension(extension)) {
    throw new Error("The video extension must be mp4, mov, webm, or m4v.");
  }

  return extension;
}

export function contentTypeForVideoExtension(extension: string): string {
  return contentTypesByExtension[normalizeVideoExtension(extension)];
}

/** Extracts and validates the extension from a user-supplied file name. */
export function extensionFromFileName(fileName: string): VideoExtension {
  const extension = fileName.split(".").pop();
  if (extension === undefined || extension === fileName) {
    throw new Error("Choose an MP4, MOV, WebM, or M4V video file.");
  }

  try {
    return normalizeVideoExtension(extension);
  } catch {
    throw new Error("Choose an MP4, MOV, WebM, or M4V video file.");
  }
}

export function normalizeUploadSize(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > maxUploadBytes
  ) {
    throw new Error(
      `The video must be between 1 byte and ${maxUploadBytes} bytes.`,
    );
  }

  return value;
}

export function isSafeProcessedVideoName(value: unknown): value is string {
  return typeof value === "string" && processedVideoNamePattern.test(value);
}

export function isSafeLocalVideoName(value: unknown): value is string {
  return typeof value === "string" && safeLocalVideoNamePattern.test(value);
}

/** Builds the processed object name for one rendition of a video. */
export function processedVideoName(
  videoId: string,
  rendition: RenditionName,
): string {
  const name = `processed-${videoId}-${rendition}.mp4`;
  if (!isSafeProcessedVideoName(name)) {
    throw new Error("The processed video name is invalid.");
  }

  return name;
}

/**
 * Recovers the upload timestamp encoded in a video ID.
 *
 * Used to age out claims written before `claimedAt` was recorded.
 */
export function uploadTimestamp(videoId: string): number | null {
  const match = /(?:-|~)(\d{13})(?:~[0-9a-f-]{36})?$/i.exec(videoId);
  if (!match) {
    return null;
  }

  const timestamp = Number(match[1]);
  return Number.isSafeInteger(timestamp) ? timestamp : null;
}

/** Whitelists the fields that are safe to expose from the public video feed. */
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
  if (Array.isArray(storedVideo.renditions)) {
    const renditions = storedVideo.renditions.filter(
      (rendition): rendition is RenditionName =>
        videoRenditions.some((known) => known.name === rendition),
    );
    if (renditions.length > 0) {
      video.renditions = renditions;
    }
  }

  const uploadedAt = uploadTimestamp(id);
  if (uploadedAt !== null) {
    video.uploadedAt = uploadedAt;
  }

  return video;
}
