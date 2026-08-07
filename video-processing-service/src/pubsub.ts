import {
  processedVideoName,
  videoRenditions,
  type RenditionName,
} from "@yt/contract";
import { parseRawVideoName } from "@yt/contract/server";

export const defaultRawVideoBucketName = "redd-raw-videos";

export interface VideoOutputFile {
  fileName: string;
  rendition: RenditionName;
}

export interface VideoUploadEvent {
  inputFileName: string;
  outputFileNames: VideoOutputFile[];
  videoId: string;
  uid: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeBase64Json(value: unknown): unknown {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    throw new Error("Pub/Sub message data must be canonical base64.");
  }

  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) {
    throw new Error("Pub/Sub message data is not valid base64.");
  }

  try {
    return JSON.parse(decoded.toString("utf8")) as unknown;
  } catch {
    throw new Error("Pub/Sub message data must contain JSON.");
  }
}

export function parseVideoUploadRequest(
  body: unknown,
  expectedBucket = defaultRawVideoBucketName,
): VideoUploadEvent {
  if (!isRecord(body) || !isRecord(body.message)) {
    throw new Error("The request must contain a Pub/Sub message.");
  }

  const event = decodeBase64Json(body.message.data);
  if (!isRecord(event)) {
    throw new Error("The Pub/Sub data must contain a storage event.");
  }

  if (typeof event.bucket !== "string" || event.bucket !== expectedBucket) {
    throw new Error("The storage event came from an unexpected bucket.");
  }

  const parsedName = parseRawVideoName(event.name);
  return {
    ...parsedName,
    outputFileNames: videoRenditions.map((rendition) => ({
      fileName: processedVideoName(parsedName.videoId, rendition.name),
      rendition: rendition.name,
    })),
  };
}
