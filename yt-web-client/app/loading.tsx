import styles from "./loading.module.css";

/**
 * Skeletons that match the real card geometry, so the layout does not shift
 * when the feed resolves.
 */
export default function Loading() {
  return (
    <>
      <div className={styles.intro} aria-hidden="true">
        <span className={styles.headingBar} />
        <span className={styles.ledeBar} />
      </div>
      <ul className={styles.grid} aria-busy="true" aria-label="Loading videos">
        {Array.from({ length: 8 }, (_, index) => (
          <li key={index} className={styles.card}>
            <span className={styles.frame} />
            <span className={styles.titleBar} />
            <span className={styles.metaBar} />
          </li>
        ))}
      </ul>
    </>
  );
}
