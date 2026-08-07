import { stageLabels, videoStages, type VideoStage } from "../lib/format";
import styles from "./develop-rail.module.css";

/**
 * The signature element.
 *
 * Every video moves through exactly three states the backend really records —
 * uploaded, developing, ready — so the rail is a genuine sequence rather than
 * decorative numbering. Surfacing it is the whole point of the product: before
 * this existed, a freshly uploaded video simply did not appear anywhere for
 * several minutes with no explanation.
 */
export function DevelopRail({
  stage,
  failed = false,
  compact = false,
}: {
  stage: VideoStage;
  failed?: boolean;
  compact?: boolean;
}) {
  const activeIndex = videoStages.indexOf(stage);
  const label = failed
    ? "Processing failed"
    : `${stageLabels[stage]}${stage === "ready" ? "" : "…"}`;

  return (
    <div
      className={compact ? styles.railCompact : styles.rail}
      role="group"
      aria-label={`Status: ${label}`}
    >
      <ol className={styles.track}>
        {videoStages.map((candidate, index) => {
          const state = failed
            ? index <= activeIndex
              ? "failed"
              : "pending"
            : index < activeIndex
              ? "done"
              : index === activeIndex
                ? stage === "ready"
                  ? "done"
                  : "active"
                : "pending";

          return (
            <li
              key={candidate}
              className={styles[state]}
              data-stage={candidate}
            >
              <span className="visuallyHidden">{stageLabels[candidate]}</span>
            </li>
          );
        })}
      </ol>
      {!compact && (
        <span className={failed ? styles.labelFailed : styles.label}>
          {label}
        </span>
      )}
    </div>
  );
}
