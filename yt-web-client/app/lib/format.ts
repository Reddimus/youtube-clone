import type { PublicVideo } from "@yt/contract";

/** The lifecycle states the backend actually records for a video. */
export type VideoStage = "uploaded" | "developing" | "ready";

export const videoStages: readonly VideoStage[] = [
  "uploaded",
  "developing",
  "ready",
];

export const stageLabels: Readonly<Record<VideoStage, string>> = {
  uploaded: "Uploaded",
  developing: "Developing",
  ready: "Ready",
};

/**
 * Derives a display title.
 *
 * Most videos in the archive predate the title field, so falling back to the
 * upload date keeps every card readable instead of showing a raw object name.
 */
export function videoTitle(video: PublicVideo): string {
  const title = video.title?.trim();
  if (title) {
    return title;
  }

  return video.uploadedAt
    ? `Untitled — ${formatDate(video.uploadedAt)}`
    : "Untitled video";
}

export function formatDate(epochMillis: number): string {
  return new Date(epochMillis).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const relativeFormatter = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

const relativeThresholds = [
  { limit: 60_000, unit: "second" as const, ms: 1_000 },
  { limit: 3_600_000, unit: "minute" as const, ms: 60_000 },
  { limit: 86_400_000, unit: "hour" as const, ms: 3_600_000 },
  { limit: 2_592_000_000, unit: "day" as const, ms: 86_400_000 },
  { limit: 31_536_000_000, unit: "month" as const, ms: 2_592_000_000 },
];

/**
 * Formats a timestamp as "3 days ago".
 *
 * `now` is injectable so the output is deterministic under test.
 */
export function formatRelativeTime(epochMillis: number, now = Date.now()): string {
  const elapsed = epochMillis - now;
  const magnitude = Math.abs(elapsed);

  for (const { limit, unit, ms } of relativeThresholds) {
    if (magnitude < limit) {
      return relativeFormatter.format(Math.round(elapsed / ms), unit);
    }
  }

  return relativeFormatter.format(
    Math.round(elapsed / 31_536_000_000),
    "year",
  );
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "—";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KiB", "MiB", "GiB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`;
}
