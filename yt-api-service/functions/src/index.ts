import { Buffer } from "node:buffer";

import { Storage } from "@google-cloud/storage";
import {
  contentTypeForVideoExtension,
  maxUploadBytes,
  normalizeUploadSize,
  normalizeVideoExtension,
  toPublicVideo,
  type PublicVideo,
} from "@yt/contract";
import { buildRawVideoName, parseRawVideoName } from "@yt/contract/server";
import { getApps, initializeApp } from "firebase-admin/app";
import {
  FieldPath,
  Timestamp,
  getFirestore,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { auth as authV1 } from "firebase-functions/v1";
import { HttpsError, onCall } from "firebase-functions/v2/https";

const firebaseApp = getApps()[0] ?? initializeApp();
const firestore = getFirestore(firebaseApp);
const storage = new Storage();

const rawVideoBucketName = process.env.RAW_VIDEO_BUCKET ?? "redd-raw-videos";
const videoCollectionId = "videos";
const defaultVideoLimit = 12;
const maximumVideoLimit = 50;
const legacyQueryBatchSize = 50;
const maximumLegacyQueryBatches = 5;
const cursorVersion = 1;
const controlCharacterPattern = /\p{Cc}/u;

interface UploadRequestData {
  description?: unknown;
  fileExtension?: unknown;
  fileSize?: unknown;
  title?: unknown;
}

interface VideoFeedRequestData {
  cursor?: unknown;
  limit?: unknown;
}

interface VideoRequestData {
  id?: unknown;
}

interface UpdatedCursor {
  id: string;
  phase: "updated";
  updatedAtMilliseconds: number;
  version: typeof cursorVersion;
}

interface LegacyCursor {
  afterId: string | null;
  phase: "legacy";
  version: typeof cursorVersion;
}

type VideoCursor = UpdatedCursor | LegacyCursor;

interface VideoPage {
  nextCursor: string | null;
  videos: PublicVideo[];
}

interface LegacyDocumentPage {
  documents: QueryDocumentSnapshot[];
  resumeAfterId: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateOptionalText(
  value: unknown,
  fieldName: string,
  maximumCharacters: number,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must be a string.`);
  }
  if (controlCharacterPattern.test(value)) {
    throw new Error(`${fieldName} cannot contain control characters.`);
  }

  const trimmed = value.trim();
  if ([...trimmed].length > maximumCharacters) {
    throw new Error(
      `${fieldName} must be ${maximumCharacters} characters or fewer.`,
    );
  }

  return trimmed;
}

function normalizeVideoLimit(value: unknown): number {
  if (value === undefined) {
    return defaultVideoLimit;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HttpsError("invalid-argument", "limit must be a number.");
  }

  return Math.min(maximumVideoLimit, Math.max(1, Math.trunc(value)));
}

function isSafeDocumentId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Buffer.byteLength(value, "utf8") <= 1_500 &&
    !value.includes("/") &&
    !controlCharacterPattern.test(value)
  );
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  return (
    keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index])
  );
}

function decodeCursor(value: unknown): VideoCursor | null {
  if (value === undefined) {
    return null;
  }

  try {
    if (
      typeof value !== "string" ||
      value.length === 0 ||
      value.length > 4_096 ||
      !/^[A-Za-z0-9_-]+$/.test(value)
    ) {
      throw new Error("Invalid cursor encoding.");
    }

    const decoded = Buffer.from(value, "base64url");
    if (decoded.toString("base64url") !== value) {
      throw new Error("Non-canonical cursor encoding.");
    }

    const parsed = JSON.parse(decoded.toString("utf8")) as unknown;
    if (!isRecord(parsed) || parsed.version !== cursorVersion) {
      throw new Error("Invalid cursor payload.");
    }

    if (
      parsed.phase === "updated" &&
      hasExactKeys(parsed, [
        "id",
        "phase",
        "updatedAtMilliseconds",
        "version",
      ]) &&
      isSafeDocumentId(parsed.id) &&
      typeof parsed.updatedAtMilliseconds === "number" &&
      Number.isSafeInteger(parsed.updatedAtMilliseconds) &&
      parsed.updatedAtMilliseconds >= 0
    ) {
      return {
        id: parsed.id,
        phase: "updated",
        updatedAtMilliseconds: parsed.updatedAtMilliseconds,
        version: cursorVersion,
      };
    }

    if (
      parsed.phase === "legacy" &&
      hasExactKeys(parsed, ["afterId", "phase", "version"]) &&
      (parsed.afterId === null || isSafeDocumentId(parsed.afterId))
    ) {
      return {
        afterId: parsed.afterId,
        phase: "legacy",
        version: cursorVersion,
      };
    }

    throw new Error("Invalid cursor payload.");
  } catch {
    throw new HttpsError("invalid-argument", "cursor is malformed.");
  }
}

function encodeCursor(cursor: VideoCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function updatedAtMilliseconds(document: QueryDocumentSnapshot): number {
  const data = document.data() as Record<string, unknown>;
  const updatedAt = data.updatedAt;
  if (!(updatedAt instanceof Timestamp)) {
    throw new HttpsError(
      "internal",
      "A processed video has an invalid update timestamp.",
    );
  }

  return updatedAt.toMillis();
}

function toPublicProcessedVideos(
  documents: readonly QueryDocumentSnapshot[],
): PublicVideo[] {
  return documents.flatMap((document) =>
    document.data().status === "processed"
      ? [toPublicVideo(document.id, document.data())]
      : [],
  );
}

async function getUpdatedDocuments(
  limit: number,
  cursor: UpdatedCursor | null,
): Promise<QueryDocumentSnapshot[]> {
  let query: Query = firestore
    .collection(videoCollectionId)
    .where("status", "==", "processed")
    .orderBy("updatedAt", "desc")
    .orderBy(FieldPath.documentId(), "desc");

  if (cursor) {
    query = query.startAfter(
      Timestamp.fromMillis(cursor.updatedAtMilliseconds),
      cursor.id,
    );
  }

  return (await query.limit(limit).get()).docs;
}

async function getLegacyDocuments(
  wantedCount: number,
  initialAfterId: string | null,
): Promise<LegacyDocumentPage> {
  const legacyDocuments: QueryDocumentSnapshot[] = [];
  let afterId = initialAfterId;
  let batchesScanned = 0;

  while (
    legacyDocuments.length < wantedCount &&
    batchesScanned < maximumLegacyQueryBatches
  ) {
    let query: Query = firestore
      .collection(videoCollectionId)
      .where("status", "==", "processed")
      .orderBy(FieldPath.documentId(), "desc");
    if (afterId !== null) {
      query = query.startAfter(afterId);
    }

    const documents = (await query.limit(legacyQueryBatchSize).get()).docs;
    batchesScanned += 1;
    for (const document of documents) {
      if (!("updatedAt" in document.data())) {
        legacyDocuments.push(document);
        if (legacyDocuments.length === wantedCount) {
          break;
        }
      }
    }

    if (documents.length < legacyQueryBatchSize) {
      return { documents: legacyDocuments, resumeAfterId: null };
    }
    const lastDocument = documents.at(-1);
    if (!lastDocument) {
      break;
    }
    afterId = lastDocument.id;
  }

  return {
    documents: legacyDocuments,
    resumeAfterId:
      legacyDocuments.length < wantedCount &&
      batchesScanned === maximumLegacyQueryBatches
        ? afterId
        : null,
  };
}

export const createUser = authV1.user().onCreate(async (user) => {
  await firestore
    .collection("users")
    .doc(user.uid)
    .set({
      uid: user.uid,
      email: user.email ?? null,
      photoUrl: user.photoURL ?? null,
    });

  logger.info("User record created.", { uid: user.uid });
});

/** Generates a short-lived upload URL for an authenticated video upload. */
export const generateUploadUrl = onCall(
  { maxInstances: 1 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in before requesting a video upload URL.",
      );
    }

    let extension: string;
    let title: string | undefined;
    let description: string | undefined;
    try {
      const data = (
        isRecord(request.data) ? request.data : {}
      ) as UploadRequestData;
      extension = normalizeVideoExtension(data.fileExtension);
      normalizeUploadSize(data.fileSize);
      title = validateOptionalText(data.title, "title", 100);
      description = validateOptionalText(
        data.description,
        "description",
        5_000,
      );
    } catch (error) {
      throw new HttpsError(
        "invalid-argument",
        error instanceof Error ? error.message : "Invalid upload request.",
      );
    }

    const fileName = buildRawVideoName(request.auth.uid, extension);
    const { videoId } = parseRawVideoName(fileName);
    const contentType = contentTypeForVideoExtension(extension);
    const [policy] = await storage
      .bucket(rawVideoBucketName)
      .file(fileName)
      .generateSignedPostPolicyV4({
        expires: Date.now() + 15 * 60 * 1000,
        fields: {
          "Content-Type": contentType,
        },
        conditions: [
          ["content-length-range", 1, maxUploadBytes],
          ["eq", "$Content-Type", contentType],
        ],
      });
    const now = Timestamp.now();
    // Production must expire abandoned `uploading` records with a Firestore TTL
    // policy or a scheduled sweep after clients cancel or disappear mid-upload.
    await firestore
      .collection(videoCollectionId)
      .doc(videoId)
      .set({
        id: videoId,
        uid: request.auth.uid,
        ...(title === undefined ? {} : { title }),
        ...(description === undefined ? {} : { description }),
        status: "uploading",
        createdAt: now,
        updatedAt: now,
      });

    return {
      url: policy.url,
      fields: policy.fields,
      fileName,
      maxUploadBytes,
    };
  },
);

/** Returns a cursor-paginated public feed of videos that completed processing. */
export const getVideos = onCall({ maxInstances: 1 }, async (request) => {
  const data = (
    isRecord(request.data) ? request.data : {}
  ) as VideoFeedRequestData;
  const limit = normalizeVideoLimit(data.limit);
  const cursor = decodeCursor(data.cursor);
  const updatedCursor = cursor?.phase === "updated" ? cursor : null;
  const updatedDocuments =
    cursor?.phase === "legacy"
      ? []
      : await getUpdatedDocuments(limit + 1, updatedCursor);

  if (updatedDocuments.length > limit) {
    const documents = updatedDocuments.slice(0, limit);
    const lastDocument = documents.at(-1);
    if (!lastDocument) {
      throw new HttpsError("internal", "The video page could not be created.");
    }

    return {
      videos: toPublicProcessedVideos(documents),
      nextCursor: encodeCursor({
        id: lastDocument.id,
        phase: "updated",
        updatedAtMilliseconds: updatedAtMilliseconds(lastDocument),
        version: cursorVersion,
      }),
    } satisfies VideoPage;
  }

  const remaining = limit - updatedDocuments.length;
  const legacyAfterId = cursor?.phase === "legacy" ? cursor.afterId : null;
  const legacyPage = await getLegacyDocuments(
    Math.max(1, remaining + 1),
    legacyAfterId,
  );
  const legacyDocuments = legacyPage.documents;
  const includedLegacyDocuments = legacyDocuments.slice(0, remaining);
  const documents = [...updatedDocuments, ...includedLegacyDocuments];
  let nextCursor: string | null = null;

  if (legacyDocuments.length > remaining) {
    const lastIncludedLegacy = includedLegacyDocuments.at(-1);
    nextCursor = encodeCursor({
      afterId: lastIncludedLegacy?.id ?? null,
      phase: "legacy",
      version: cursorVersion,
    });
  } else if (legacyPage.resumeAfterId !== null) {
    nextCursor = encodeCursor({
      afterId: legacyPage.resumeAfterId,
      phase: "legacy",
      version: cursorVersion,
    });
  }

  return {
    videos: toPublicProcessedVideos(documents),
    nextCursor,
  } satisfies VideoPage;
});

/** Returns one processed public video by its shared-contract video ID. */
export const getVideo = onCall({ maxInstances: 1 }, async (request) => {
  const data = (isRecord(request.data) ? request.data : {}) as VideoRequestData;
  if (typeof data.id !== "string") {
    throw new HttpsError("invalid-argument", "id is invalid.");
  }

  try {
    const parsed = parseRawVideoName(`${data.id}.mp4`);
    if (parsed.videoId !== data.id) {
      throw new Error("The video ID did not round-trip.");
    }
  } catch {
    throw new HttpsError("invalid-argument", "id is invalid.");
  }

  const snapshot = await firestore
    .collection(videoCollectionId)
    .doc(data.id)
    .get();
  const video = snapshot.data();
  if (!snapshot.exists || video?.status !== "processed") {
    return null;
  }

  return toPublicVideo(snapshot.id, video);
});
