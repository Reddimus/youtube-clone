import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DevelopRail } from "../../components/develop-rail";
import { VideoPlayer } from "../../components/video-player";
import { videoSources } from "../../firebase/storage";
import { formatDate, videoTitle } from "../../lib/format";
import { fetchVideo } from "../../lib/videos";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

interface WatchPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Real per-route metadata.
 *
 * This is only possible because the page is a server component; the previous
 * `'use client'` watch page forced every route in the app to share the single
 * title "YouTube Clone".
 */
export async function generateMetadata({
  params,
}: WatchPageProps): Promise<Metadata> {
  const { id } = await params;
  const video = await fetchVideo(decodeURIComponent(id)).catch(() => null);

  if (!video) {
    return { title: "Video not found" };
  }

  const title = videoTitle(video);
  const description =
    video.description?.slice(0, 200) ?? `Watch ${title} on Redd.`;

  return {
    title,
    description,
    alternates: { canonical: `/watch/${encodeURIComponent(video.id)}` },
    openGraph: { type: "video.other", title, description },
  };
}

export default async function WatchPage({ params }: WatchPageProps) {
  const { id } = await params;
  const video = await fetchVideo(decodeURIComponent(id)).catch(() => null);

  if (!video) {
    notFound();
  }

  const title = videoTitle(video);
  const sources = videoSources(video);
  const ready = sources.length > 0;

  return (
    <article className={styles.page}>
      <nav className={styles.breadcrumb}>
        <Link href="/">← Back to the reel</Link>
      </nav>

      {ready ? (
        <VideoPlayer sources={sources} title={title} />
      ) : (
        <div className={styles.developing}>
          <DevelopRail stage="developing" />
          <p>
            Redd is still developing this video. Refresh in a moment — the
            renditions appear as soon as the transcode finishes.
          </p>
        </div>
      )}

      <div className={styles.details}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.meta}>
          {video.uploadedAt && (
            <time dateTime={new Date(video.uploadedAt).toISOString()}>
              {formatDate(video.uploadedAt)}
            </time>
          )}
          {video.renditions && video.renditions.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>{video.renditions.join(" / ")}</span>
            </>
          )}
        </p>
        {video.description && (
          <p className={styles.description}>{video.description}</p>
        )}
      </div>

      {ready && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "VideoObject",
              name: title,
              description: video.description ?? title,
              contentUrl: sources[0]?.url,
              uploadDate: video.uploadedAt
                ? new Date(video.uploadedAt).toISOString()
                : undefined,
            }),
          }}
        />
      )}
    </article>
  );
}
