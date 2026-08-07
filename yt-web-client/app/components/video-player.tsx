"use client";

import { useRef, useState } from "react";

import type { VideoSource } from "../firebase/storage";
import styles from "./video-player.module.css";

/**
 * The player, with a quality switcher driven by the real rendition ladder.
 *
 * Switching preserves playback position and play state, so changing quality
 * does not restart the video.
 */
export function VideoPlayer({
  sources,
  title,
}: {
  sources: VideoSource[];
  title: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  const active = sources[activeIndex];

  const switchTo = (index: number) => {
    const element = videoRef.current;
    const resumeAt = element?.currentTime ?? 0;
    const wasPlaying = element ? !element.paused && !element.ended : false;

    setActiveIndex(index);
    setFailed(false);

    // The <video> reloads on src change, so restore position once it can seek.
    window.requestAnimationFrame(() => {
      const next = videoRef.current;
      if (!next) {
        return;
      }
      const restore = () => {
        next.currentTime = resumeAt;
        if (wasPlaying) {
          void next.play().catch(() => {
            /* Autoplay policies can refuse; the controls still work. */
          });
        }
      };
      next.addEventListener("loadedmetadata", restore, { once: true });
    });
  };

  if (!active) {
    return (
      <div className={styles.unavailable} role="status">
        <p>This video has no playable rendition yet.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.stage}>
        {failed ? (
          <div className={styles.unavailable} role="alert">
            <p>This video could not be loaded. It may still be developing.</p>
          </div>
        ) : (
          <video
            ref={videoRef}
            className={styles.video}
            src={active.url}
            controls
            playsInline
            preload="metadata"
            aria-label={title}
            onError={() => {
              setFailed(true);
            }}
          >
            <p>
              Your browser cannot play this video.{" "}
              <a href={active.url} download>
                Download it instead
              </a>
              .
            </p>
          </video>
        )}
      </div>

      {sources.length > 1 && (
        <div className={styles.quality}>
          <span id="quality-label" className={styles.qualityLabel}>
            Quality
          </span>
          <div
            className={styles.qualityOptions}
            role="radiogroup"
            aria-labelledby="quality-label"
          >
            {sources.map((source, index) => (
              <button
                key={source.rendition}
                type="button"
                role="radio"
                aria-checked={index === activeIndex}
                className={
                  index === activeIndex ? styles.qualityOn : styles.qualityOff
                }
                onClick={() => {
                  switchTo(index);
                }}
              >
                {source.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
