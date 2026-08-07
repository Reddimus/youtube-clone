import { randomUUID } from "node:crypto";

import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";

import type { RenditionName } from "@yt/contract";

import { uploadTimestamp, type VideoClaimResult } from "./claims";

const firebaseApp =
  getApps()[0] ?? initializeApp({ credential: applicationDefault() });
const firestore = getFirestore(firebaseApp);

const videoCollectionId = "videos";
const claimLeaseMilliseconds = 65 * 60 * 1000;

interface StoredVideo {
  claimToken?: string;
  claimedAt?: Timestamp;
  status?: "processing" | "processed" | "failed";
}

export async function claimVideo(
  videoId: string,
  uid: string,
): Promise<VideoClaimResult> {
  const videoReference = firestore.collection(videoCollectionId).doc(videoId);
  const claimToken = randomUUID();
  const now = Timestamp.now();

  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(videoReference);
    const video = snapshot.data() as StoredVideo | undefined;

    if (video?.status === "processed") {
      return { status: "processed" };
    }

    if (video?.status === "processing") {
      const claimedAt =
        video.claimedAt instanceof Timestamp
          ? video.claimedAt.toMillis()
          : uploadTimestamp(videoId);
      if (
        claimedAt === null ||
        now.toMillis() - claimedAt < claimLeaseMilliseconds
      ) {
        return { status: "leased" };
      }
    }

    transaction.set(
      videoReference,
      {
        id: videoId,
        uid,
        status: "processing",
        claimToken,
        claimedAt: now,
        updatedAt: now,
      },
      { merge: true },
    );

    return { status: "claimed", token: claimToken };
  });
}

export async function completeVideo(
  videoId: string,
  claimToken: string,
  filename: string,
  renditions: RenditionName[],
): Promise<boolean> {
  const videoReference = firestore.collection(videoCollectionId).doc(videoId);

  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(videoReference);
    const video = snapshot.data() as StoredVideo | undefined;
    if (video?.claimToken !== claimToken || video.status !== "processing") {
      return false;
    }

    transaction.set(
      videoReference,
      {
        status: "processed",
        filename,
        renditions,
        claimToken: FieldValue.delete(),
        claimedAt: FieldValue.delete(),
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );
    return true;
  });
}

export async function failVideo(
  videoId: string,
  claimToken: string,
): Promise<void> {
  const videoReference = firestore.collection(videoCollectionId).doc(videoId);

  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(videoReference);
    const video = snapshot.data() as StoredVideo | undefined;
    if (video?.claimToken !== claimToken || video.status !== "processing") {
      return;
    }

    transaction.set(
      videoReference,
      {
        status: "failed",
        claimToken: FieldValue.delete(),
        claimedAt: FieldValue.delete(),
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    );
  });
}
