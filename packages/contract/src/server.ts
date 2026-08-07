/**
 * Node-only half of the shared contract.
 *
 * These helpers depend on `Buffer` and `node:crypto`, so they are deliberately
 * kept out of the isomorphic entry point that the browser bundle imports.
 */

import { randomUUID } from "node:crypto";

import {
  legacyRawVideoNamePattern,
  normalizeVideoExtension,
  rawVideoNamePattern,
  uploadIdPattern,
} from "./index";

const minTimestamp = 1_000_000_000_000;
const maxTimestamp = 9_999_999_999_999;
const maxUidBytes = 128;

export interface RawVideoName {
  /** The uploaded object name, verbatim. */
  inputFileName: string;
  /** The object name without its extension; the Firestore document ID. */
  videoId: string;
  /** The decoded Firebase UID of the uploader. */
  uid: string;
}

/** Encodes an arbitrary Firebase UID into a storage-safe, reversible segment. */
export function encodeUserId(uid: string): string {
  if (!uid || Buffer.byteLength(uid, "utf8") > maxUidBytes) {
    throw new Error("The authenticated user ID is invalid.");
  }

  return Buffer.from(uid, "utf8").toString("base64url");
}

/**
 * Reverses {@link encodeUserId}.
 *
 * Round-trips through base64url and UTF-8 so a non-canonical encoding cannot
 * smuggle a different byte sequence past the check.
 */
export function decodeUserId(encodedUserId: string): string {
  const uidBuffer = Buffer.from(encodedUserId, "base64url");
  const uid = uidBuffer.toString("utf8");

  if (
    uidBuffer.length === 0 ||
    uidBuffer.length > maxUidBytes ||
    uidBuffer.toString("base64url") !== encodedUserId ||
    !Buffer.from(uid, "utf8").equals(uidBuffer)
  ) {
    throw new Error("The video object contains an invalid user ID.");
  }

  return uid;
}

/**
 * Builds the raw upload object name.
 *
 * `timestamp` and `uploadId` are injectable so the name is deterministic under
 * test; both are validated regardless of origin.
 */
export function buildRawVideoName(
  uid: string,
  extension: string,
  timestamp = Date.now(),
  uploadId: string = randomUUID(),
): string {
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp < minTimestamp ||
    timestamp > maxTimestamp
  ) {
    throw new Error("The upload timestamp is invalid.");
  }

  if (!uploadIdPattern.test(uploadId)) {
    throw new Error("The upload ID is invalid.");
  }

  return `u~${encodeUserId(uid)}~${timestamp}~${uploadId}.${normalizeVideoExtension(extension)}`;
}

/**
 * Parses a raw upload object name into its components.
 *
 * Accepts the current encoded form and the pre-2026 legacy form. Rejects
 * anything already in the processed namespace so a processed object cannot be
 * fed back into the pipeline.
 */
export function parseRawVideoName(name: unknown): RawVideoName {
  if (typeof name !== "string") {
    throw new Error("The storage event is missing an object name.");
  }

  // Case-insensitive to match the name patterns themselves. A case-sensitive
  // check let `Processed-uid-1717171717171.mp4` satisfy both the raw and the
  // processed grammars at once, defeating this guard.
  if (/^processed-/i.test(name)) {
    throw new Error("Processed videos cannot be submitted for processing.");
  }

  const encodedMatch = rawVideoNamePattern.exec(name);
  const legacyMatch = encodedMatch
    ? null
    : legacyRawVideoNamePattern.exec(name);
  const match = encodedMatch ?? legacyMatch;

  if (!match) {
    throw new Error("The storage object name is not a supported video name.");
  }

  const uid = encodedMatch ? decodeUserId(match[1]) : match[1];
  const videoId = name.slice(0, name.lastIndexOf("."));

  return { inputFileName: name, videoId, uid };
}
