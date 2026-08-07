import Link from "next/link";

import { VideoCard } from "./components/video-card";
import { fetchVideoPage } from "./lib/videos";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { cursor } = await searchParams;

  let page;
  let failed = false;
  try {
    page = await fetchVideoPage({ limit: 12, cursor });
  } catch {
    failed = true;
  }

  return (
    <>
      <header className={styles.intro}>
        <h1 className={styles.heading}>The reel</h1>
        <p className={styles.lede}>
          Every upload is decoded once and developed into a 360p and 720p
          rendition before it lands here.
        </p>
      </header>

      {failed ? (
        <div className={styles.notice} role="alert">
          <h2>The feed is unreachable</h2>
          <p>
            The video API did not respond. If you are running Redd locally, make
            sure the Firebase emulators are running.
          </p>
          <Link href="/" className={styles.retry}>
            Try again
          </Link>
        </div>
      ) : page && page.videos.length > 0 ? (
        <>
          <ul className={styles.grid}>
            {page.videos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </ul>
          {page.nextCursor && (
            <nav className={styles.pagination} aria-label="Feed pagination">
              <Link
                href={{ query: { cursor: page.nextCursor } }}
                className={styles.more}
              >
                Load more
              </Link>
            </nav>
          )}
        </>
      ) : (
        <div className={styles.notice}>
          <h2>Nothing developed yet</h2>
          <p>
            {cursor
              ? "You have reached the end of the reel."
              : "Sign in and upload a video — it will appear here once the pipeline finishes transcoding it."}
          </p>
          {cursor && (
            <Link href="/" className={styles.retry}>
              Back to the start
            </Link>
          )}
        </div>
      )}
    </>
  );
}
