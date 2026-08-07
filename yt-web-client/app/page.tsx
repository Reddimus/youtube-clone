"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  getVideos,
  isSafeProcessedVideoName,
  type Video,
} from "./firebase/functions";
import styles from "./page.module.css";

export default function Home() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void getVideos()
      .then((result) => {
        if (active) {
          setVideos(result);
        }
      })
      .catch(() => {
        if (active) {
          setError("Videos could not be loaded. Please try again later.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <main aria-busy="true">Loading videos…</main>;
  }

  if (error) {
    return <main role="alert">{error}</main>;
  }

  return (
    <main>
      {videos
        .filter((video) => isSafeProcessedVideoName(video.filename))
        .map((video) => (
          <Link
            href={{ pathname: "/watch", query: { v: video.filename } }}
            key={video.id}
          >
            <Image
              src="/default-thumbnail.png"
              alt="Video thumbnail"
              width={120}
              height={80}
              className={styles.thumbnail}
            />
          </Link>
        ))}
    </main>
  );
}
