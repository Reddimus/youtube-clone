export const defaultRawVideoBucketName = "redd-raw-videos";

const allowedExtensions = "mp4|mov|webm|m4v";
const uploadId =
  "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const encodedNamePattern = new RegExp(
  `^u~([A-Za-z0-9_-]+)~(\\d{13})~(${uploadId})\\.(${allowedExtensions})$`,
  "i",
);
const legacyNamePattern = new RegExp(
  `^([A-Za-z0-9_-]{1,128})-(\\d{13})\\.(${allowedExtensions})$`,
  "i",
);

export interface VideoUploadEvent {
  inputFileName: string;
  outputFileName: string;
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

function decodeUserId(encodedUserId: string): string {
  const uidBuffer = Buffer.from(encodedUserId, "base64url");
  const uid = uidBuffer.toString("utf8");

  if (
    uidBuffer.length === 0 ||
    uidBuffer.length > 128 ||
    uidBuffer.toString("base64url") !== encodedUserId ||
    !Buffer.from(uid, "utf8").equals(uidBuffer)
  ) {
    throw new Error("The video object contains an invalid user ID.");
  }

  return uid;
}

export function parseVideoObjectName(name: unknown): VideoUploadEvent {
  if (typeof name !== "string") {
    throw new Error("The storage event is missing an object name.");
  }

  if (name.startsWith("processed-")) {
    throw new Error("Processed videos cannot be submitted for processing.");
  }

  const encodedMatch = encodedNamePattern.exec(name);
  const legacyMatch = encodedMatch ? null : legacyNamePattern.exec(name);
  const match = encodedMatch ?? legacyMatch;

  if (!match) {
    throw new Error("The storage object name is not a supported video name.");
  }

  const uid = encodedMatch ? decodeUserId(match[1]) : match[1];
  const videoId = name.slice(0, name.lastIndexOf("."));

  return {
    inputFileName: name,
    outputFileName: `processed-${videoId}.mp4`,
    videoId,
    uid,
  };
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

  return parseVideoObjectName(event.name);
}
