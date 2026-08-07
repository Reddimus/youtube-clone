import {
  isSafeProcessedVideoName,
  processedVideoName,
  sortRenditionsByHeight,
  type PublicVideo,
  type RenditionName,
} from "@yt/contract";

import { demoMediaBase, isDemoMode } from "../lib/runtime";

const defaultProcessedVideoBucket = "redd-processed-videos";
const bucketNamePattern = /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/;

export interface VideoSource {
  rendition: RenditionName | "source";
  label: string;
  url: string;
}

export function processedVideoBucket(): string {
  // `||` rather than `??`: an unset Docker ARG becomes an empty string, which
  // would otherwise fail the bucket-name pattern and throw at render time.
  const bucketName =
    process.env.NEXT_PUBLIC_PROCESSED_VIDEO_BUCKET?.trim() ||
    defaultProcessedVideoBucket;

  if (!bucketNamePattern.test(bucketName)) {
    throw new Error("The processed-video bucket name is invalid.");
  }

  return bucketName;
}

export function processedVideoUrl(
  fileName: string,
  bucketName?: string,
): string {
  // In demo mode the sample renditions are served from the app itself, so the
  // prototype plays real video with no bucket and no cloud account.
  if (bucketName === undefined && isDemoMode()) {
    return `${demoMediaBase}/${encodeURIComponent(fileName)}`;
  }

  const bucket = bucketName ?? processedVideoBucket();
  if (!bucketNamePattern.test(bucket)) {
    throw new Error("The processed-video bucket name is invalid.");
  }

  return `https://storage.googleapis.com/${bucket}/${encodeURIComponent(fileName)}`;
}

/**
 * Builds the playable sources for a video, best quality first.
 *
 * Videos processed before the rendition ladder shipped carry only a `filename`
 * and no `renditions` array; those still resolve to a single source.
 */
export function videoSources(video: PublicVideo): VideoSource[] {
  const renditions = video.renditions ?? [];

  if (renditions.length > 0) {
    return sortRenditionsByHeight(renditions)
      .map((rendition) => ({
        rendition,
        label: rendition,
        url: processedVideoUrl(processedVideoName(video.id, rendition)),
      }))
      .reverse();
  }

  if (video.filename && isSafeProcessedVideoName(video.filename)) {
    return [
      {
        rendition: "source" as const,
        label: "Source",
        url: processedVideoUrl(video.filename),
      },
    ];
  }

  return [];
}
