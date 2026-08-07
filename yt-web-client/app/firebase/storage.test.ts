import type { PublicVideo } from "@yt/contract";
import { afterEach, describe, expect, it, vi } from "vitest";

import { processedVideoUrl, videoSources } from "./storage";

const videoId =
  "u~dWlkLTEyMw~1717171717171~0f9d2f2f-6a3a-4b1e-9c2e-2f1a5b6c7d8e";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("processedVideoUrl", () => {
  it("builds a public object URL and encodes the file name", () => {
    expect(
      processedVideoUrl("processed-a-1717171717171.mp4", "my-bucket"),
    ).toBe(
      "https://storage.googleapis.com/my-bucket/processed-a-1717171717171.mp4",
    );
    expect(processedVideoUrl("a~b.mp4", "my-bucket")).toContain("a~b.mp4");
  });

  it.each(["", "A-Bad-Bucket", "-leading", "x", "b".repeat(230)])(
    "rejects bucket name %j",
    (bucket) => {
      expect(() => processedVideoUrl("clip.mp4", bucket)).toThrow(
        "The processed-video bucket name is invalid.",
      );
    },
  );
});

describe("videoSources", () => {
  it("returns one source per rendition, best quality first", () => {
    const video: PublicVideo = {
      id: videoId,
      filename: `processed-${videoId}-360p.mp4`,
      renditions: ["360p", "720p"],
    };

    const sources = videoSources(video);
    expect(sources.map((source) => source.rendition)).toEqual(["720p", "360p"]);
    expect(sources[0].url).toContain(`processed-${videoId}-720p.mp4`);
  });

  it("falls back to the stored filename for pre-ladder videos", () => {
    const video: PublicVideo = {
      id: videoId,
      filename: `processed-${videoId}.mp4`,
    };

    expect(videoSources(video)).toEqual([
      {
        rendition: "source",
        label: "Source",
        url: processedVideoUrl(`processed-${videoId}.mp4`),
      },
    ]);
  });

  it("returns nothing when the video has no playable output", () => {
    expect(videoSources({ id: videoId })).toEqual([]);
    expect(videoSources({ id: videoId, filename: "../../etc/passwd" })).toEqual(
      [],
    );
  });
});
