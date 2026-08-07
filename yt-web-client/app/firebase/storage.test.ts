import { describe, expect, it } from "vitest";

import { processedVideoUrl } from "./storage";

describe("processedVideoUrl", () => {
  it("builds a URL for a validated bucket", () => {
    expect(processedVideoUrl("processed-video.mp4", "video-bucket")).toBe(
      "https://storage.googleapis.com/video-bucket/processed-video.mp4",
    );
  });

  it.each(["", "UPPERCASE", "bucket/path", "bucket?query"])(
    "rejects invalid bucket %s",
    (bucket) => {
      expect(() => processedVideoUrl("video.mp4", bucket)).toThrow();
    },
  );
});
