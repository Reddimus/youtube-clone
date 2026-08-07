import type { PublicVideo } from "@yt/contract";
import Link from "next/link";

import { formatRelativeTime, videoTitle } from "../lib/format";
import { DevelopRail } from "./develop-rail";
import styles from "./video-card.module.css";

/**
 * A feed card.
 *
 * The whole card is one link with the title as its accessible name. The
 * previous implementation wrapped a bare placeholder image, so every card in
 * the feed announced the identical string "Video thumbnail" and a screen-reader
 * user could not tell them apart.
 */
export function VideoCard({ video }: { video: PublicVideo }) {
  const title = videoTitle(video);
  const ready = Boolean(video.filename);
  const renditions = video.renditions ?? [];

  return (
    <li className={styles.card}>
      <Link
        href={`/watch/${encodeURIComponent(video.id)}`}
        className={styles.link}
      >
        <span className={styles.frame}>
          <span className={styles.frameInner} aria-hidden="true">
            <svg viewBox="0 0 48 48" width="32" height="32" fill="none">
              <path
                d="M19 15.5v17l14-8.5-14-8.5Z"
                fill="currentColor"
                opacity="0.55"
              />
            </svg>
          </span>
          {renditions.length > 0 && (
            <span className={styles.badge}>
              {renditions[renditions.length - 1]}
            </span>
          )}
        </span>

        <span className={styles.body}>
          <span className={styles.title}>{title}</span>
          {video.description && (
            <span className={styles.description}>{video.description}</span>
          )}
          <span className={styles.meta}>
            {video.uploadedAt ? (
              <time dateTime={new Date(video.uploadedAt).toISOString()}>
                {formatRelativeTime(video.uploadedAt)}
              </time>
            ) : (
              <span>Undated</span>
            )}
            {renditions.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>{renditions.join(" / ")}</span>
              </>
            )}
          </span>
        </span>
      </Link>

      {!ready && (
        <div className={styles.status}>
          <DevelopRail stage="developing" />
        </div>
      )}
    </li>
  );
}
