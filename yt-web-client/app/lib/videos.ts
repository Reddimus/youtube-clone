import "server-only";

import { isSafeProcessedVideoName, type PublicVideo } from "@yt/contract";

import { demoVideos } from "./demo-data";
import { isDemoMode } from "./runtime";

export interface VideoPage {
  videos: PublicVideo[];
  nextCursor: string | null;
}

const defaultRegion = "us-central1";
const requestTimeoutMs = 8_000;
/** Bounds the legacy fallback scan in `fetchVideo` so it can never run away. */
const maxFallbackPages = 5;

function functionsBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_FUNCTIONS_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  if (!projectId) {
    throw new Error(
      "Set NEXT_PUBLIC_FIREBASE_PROJECT_ID or NEXT_PUBLIC_FUNCTIONS_BASE_URL to reach the video API.",
    );
  }

  return `https://${defaultRegion}-${projectId}.cloudfunctions.net`;
}

/**
 * Calls a Firebase callable function over its documented HTTP protocol.
 *
 * Rendering the feed on the server means no Firebase SDK ships to the browser
 * for read-only pages, and the markup arrives complete rather than after two
 * post-hydration round-trips.
 */
async function callFunction<T>(name: string, data: unknown): Promise<T> {
  const response = await fetch(`${functionsBaseUrl()}/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
    signal: AbortSignal.timeout(requestTimeoutMs),
    // The feed changes only when a transcode finishes, so a short shared cache
    // absorbs bursts without making new uploads feel stuck.
    next: { revalidate: 30 },
  });

  if (!response.ok) {
    throw new Error(`${name} responded with ${response.status}.`);
  }

  const payload: unknown = await response.json();
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("result" in payload)
  ) {
    throw new Error(`${name} returned an unexpected payload.`);
  }

  return (payload as { result: T }).result;
}

function isPublicVideo(value: unknown): value is PublicVideo {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { id?: unknown }).id === "string"
  );
}

/**
 * Normalizes both feed response shapes.
 *
 * The deployed API returns a bare array; the paginated API returns
 * `{ videos, nextCursor }`. Accepting both lets the client roll out
 * independently of the backend.
 */
function toVideoPage(result: unknown): VideoPage {
  const rawVideos = Array.isArray(result)
    ? result
    : typeof result === "object" &&
        result !== null &&
        Array.isArray((result as { videos?: unknown }).videos)
      ? (result as { videos: unknown[] }).videos
      : [];

  const nextCursor =
    !Array.isArray(result) &&
    typeof result === "object" &&
    result !== null &&
    typeof (result as { nextCursor?: unknown }).nextCursor === "string"
      ? (result as { nextCursor: string }).nextCursor
      : null;

  // A filename that fails the shared pattern can never resolve to a real
  // object, so it is dropped rather than rendered as a broken player.
  const videos = rawVideos
    .filter(isPublicVideo)
    .filter((video) => !video.filename || isSafeProcessedVideoName(video.filename));

  return { videos, nextCursor };
}

/** Paginates the seeded demo feed with the same cursor contract as the API. */
function demoPage(limit: number, cursor?: string | null): VideoPage {
  const start = cursor ? Number.parseInt(cursor, 10) : 0;
  const offset = Number.isSafeInteger(start) && start > 0 ? start : 0;
  const slice = demoVideos.slice(offset, offset + limit);
  const next = offset + limit;

  return {
    videos: [...slice],
    nextCursor: next < demoVideos.length ? String(next) : null,
  };
}

export async function fetchVideoPage(options?: {
  limit?: number;
  cursor?: string | null;
}): Promise<VideoPage> {
  if (isDemoMode()) {
    return Promise.resolve(demoPage(options?.limit ?? 12, options?.cursor));
  }

  const result = await callFunction<unknown>("getVideos", {
    limit: options?.limit,
    ...(options?.cursor ? { cursor: options.cursor } : {}),
  });

  return toVideoPage(result);
}

/**
 * Loads one video by ID.
 *
 * Prefers the dedicated `getVideo` endpoint. Older deployments do not expose
 * one, so it falls back to a bounded walk of the feed rather than failing.
 */
export async function fetchVideo(id: string): Promise<PublicVideo | null> {
  if (isDemoMode()) {
    return Promise.resolve(
      demoVideos.find((video) => video.id === id) ?? null,
    );
  }

  try {
    const result = await callFunction<unknown>("getVideo", { id });
    if (isPublicVideo(result)) {
      return result;
    }
  } catch {
    // Fall through to the compatibility scan below.
  }

  let cursor: string | null = null;
  for (let page = 0; page < maxFallbackPages; page += 1) {
    const result: VideoPage = await fetchVideoPage({ limit: 50, cursor });
    const match = result.videos.find((video) => video.id === id);
    if (match) {
      return match;
    }
    if (!result.nextCursor) {
      return null;
    }
    cursor = result.nextCursor;
  }

  return null;
}
