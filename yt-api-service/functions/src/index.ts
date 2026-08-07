import { Storage } from "@google-cloud/storage";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { auth as authV1 } from "firebase-functions/v1";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  createRawVideoFileName,
  contentTypeForVideoExtension,
  maxUploadBytes,
  normalizeVideoExtension,
  normalizeUploadSize,
  toPublicVideo,
} from "./video";

const firebaseApp = getApps()[0] ?? initializeApp();
const firestore = getFirestore(firebaseApp);
const storage = new Storage();

const rawVideoBucketName =
  process.env.RAW_VIDEO_BUCKET ?? "redd-raw-videos";
const videoCollectionId = "videos";

export const createUser = authV1.user().onCreate(async (user) => {
  await firestore.collection("users").doc(user.uid).set({
    uid: user.uid,
    email: user.email ?? null,
    photoUrl: user.photoURL ?? null,
  });

  logger.info("User record created.", { uid: user.uid });
});

/** Generates a short-lived upload URL for an authenticated video upload. */
export const generateUploadUrl = onCall({ maxInstances: 1 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Sign in before requesting a video upload URL.",
    );
  }

  let extension: string;
  try {
    const data = request.data as {
      fileExtension?: unknown;
      fileSize?: unknown;
    } | null;
    extension = normalizeVideoExtension(
      data?.fileExtension,
    );
    normalizeUploadSize(data?.fileSize);
  } catch (error) {
    throw new HttpsError(
      "invalid-argument",
      error instanceof Error ? error.message : "Invalid video extension.",
    );
  }

  const fileName = createRawVideoFileName(request.auth.uid, extension);
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

  return {
    url: policy.url,
    fields: policy.fields,
    fileName,
    maxUploadBytes,
  };
});

/** Returns a small public feed of videos that completed processing. */
export const getVideos = onCall({ maxInstances: 1 }, async () => {
  const snapshot = await firestore
    .collection(videoCollectionId)
    .where("status", "==", "processed")
    .limit(10)
    .get();

  return snapshot.docs.map((document) =>
    toPublicVideo(document.id, document.data()),
  );
});
