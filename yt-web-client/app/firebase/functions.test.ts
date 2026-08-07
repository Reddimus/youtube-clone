import { describe, expect, it } from "vitest";

import {
  getVideoExtension,
  isSafeProcessedVideoName,
  maxUploadBytes,
  validateVideoFileSize,
} from "./functions";

describe("getVideoExtension", () => {
  it("normalizes supported extensions", () => {
    expect(getVideoExtension("clip.MP4")).toBe("mp4");
  });

  it.each(["clip", "clip.exe", "clip.mp4/other"])(
    "rejects unsupported file name %s",
    (fileName) => {
      expect(() => getVideoExtension(fileName)).toThrow();
    },
  );
});

describe("validateVideoFileSize", () => {
  it("accepts the configured maximum", () => {
    expect(() => validateVideoFileSize(maxUploadBytes)).not.toThrow();
  });

  it.each([0, -1, maxUploadBytes + 1, 1.5])(
    "rejects invalid file size %s",
    (size) => {
      expect(() => validateVideoFileSize(size)).toThrow();
    },
  );
});

describe("isSafeProcessedVideoName", () => {
  it.each([
    "processed-u~cGVyc29uL2V4YW1wbGU~1725000000000~123e4567-e89b-42d3-a456-426614174000.mp4",
    "processed-user-1725000000000.webm",
  ])("accepts supported processed file name %s", (fileName) => {
    expect(isSafeProcessedVideoName(fileName)).toBe(true);
  });

  it.each(["../video.mp4", "video.mp4", "processed-user-1.exe"])(
    "rejects unsafe file name %s",
    (fileName) => {
      expect(isSafeProcessedVideoName(fileName)).toBe(false);
    },
  );
});
