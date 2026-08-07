import { describe, expect, it } from "vitest";

import {
  allowedVideoExtensions,
  contentTypeForVideoExtension,
  extensionFromFileName,
  isSafeLocalVideoName,
  isSafeProcessedVideoName,
  maxUploadBytes,
  normalizeUploadSize,
  normalizeVideoExtension,
  processedVideoName,
  toPublicVideo,
  uploadTimestamp,
  videoRenditions,
} from "./index";

const uuid = "0f9d2f2f-6a3a-4b1e-9c2e-2f1a5b6c7d8e";
const encodedId = `u~dWlkLTEyMw~1717171717171~${uuid}`;
const legacyId = "uid123-1717171717171";

describe("extensions", () => {
  it("normalizes case and surrounding whitespace", () => {
    expect(normalizeVideoExtension("  MP4 ")).toBe("mp4");
  });

  it.each(["avi", "mkv", "flv", "", "mp4.exe"])("rejects %j", (value) => {
    expect(() => normalizeVideoExtension(value)).toThrow();
  });

  it.each([undefined, null, 4, {}])("rejects non-string %j", (value) => {
    expect(() => normalizeVideoExtension(value)).toThrow(
      "A video file extension is required.",
    );
  });

  it("maps every allowed extension to a content type", () => {
    for (const extension of allowedVideoExtensions) {
      expect(contentTypeForVideoExtension(extension)).toMatch(/^video\//);
    }
  });

  it("reads the extension off a file name", () => {
    expect(extensionFromFileName("holiday.MOV")).toBe("mov");
  });

  it.each(["novideo", "clip.avi", "archive.tar.gz"])(
    "rejects file name %j",
    (value) => {
      expect(() => extensionFromFileName(value)).toThrow(
        "Choose an MP4, MOV, WebM, or M4V video file.",
      );
    },
  );
});

describe("upload size", () => {
  it("accepts the boundaries", () => {
    expect(normalizeUploadSize(1)).toBe(1);
    expect(normalizeUploadSize(maxUploadBytes)).toBe(maxUploadBytes);
  });

  it.each([0, -1, maxUploadBytes + 1, 1.5, Number.NaN, "10", null])(
    "rejects %j",
    (value) => {
      expect(() => normalizeUploadSize(value)).toThrow();
    },
  );
});

describe("processed video names", () => {
  it("accepts rendition-suffixed names for both ID shapes", () => {
    for (const { name } of videoRenditions) {
      expect(
        isSafeProcessedVideoName(processedVideoName(encodedId, name)),
      ).toBe(true);
      expect(isSafeProcessedVideoName(processedVideoName(legacyId, name))).toBe(
        true,
      );
    }
  });

  it("still accepts pre-ladder names that carry no rendition suffix", () => {
    expect(isSafeProcessedVideoName(`processed-${encodedId}.mp4`)).toBe(true);
    expect(isSafeProcessedVideoName(`processed-${legacyId}.mp4`)).toBe(true);
  });

  it.each([
    "processed-../../etc/passwd.mp4",
    "processed-.mp4",
    `processed-${encodedId}.exe`,
    `processed-${encodedId}-1080p.mp4`,
    `${encodedId}.mp4`,
    "processed-uid-123.mp4",
    "",
  ])("rejects %j", (value) => {
    expect(isSafeProcessedVideoName(value)).toBe(false);
  });

  it.each([undefined, null, 7, {}])("rejects non-string %j", (value) => {
    expect(isSafeProcessedVideoName(value)).toBe(false);
  });
});

describe("local video names", () => {
  it.each([`${encodedId}.mp4`, `${legacyId}.webm`])("accepts %j", (value) => {
    expect(isSafeLocalVideoName(value)).toBe(true);
  });

  it.each(["../escape.mp4", "nested/path.mp4", "no-extension", "a b.mp4"])(
    "rejects %j",
    (value) => {
      expect(isSafeLocalVideoName(value)).toBe(false);
    },
  );
});

describe("uploadTimestamp", () => {
  it("reads the timestamp from both ID shapes", () => {
    expect(uploadTimestamp(encodedId)).toBe(1_717_171_717_171);
    expect(uploadTimestamp(legacyId)).toBe(1_717_171_717_171);
  });

  it("returns null when no timestamp is present", () => {
    expect(uploadTimestamp("not-a-video-id")).toBeNull();
  });
});

describe("toPublicVideo", () => {
  it("keeps only the allowlisted fields", () => {
    const video = toPublicVideo(encodedId, {
      filename: `processed-${encodedId}-360p.mp4`,
      title: "Holiday",
      description: "A clip",
      renditions: ["360p", "720p", "4k"],
      uid: "secret-uid",
      claimToken: "secret-token",
      status: "processed",
    });

    expect(video).toEqual({
      id: encodedId,
      filename: `processed-${encodedId}-360p.mp4`,
      title: "Holiday",
      description: "A clip",
      renditions: ["360p", "720p"],
      uploadedAt: 1_717_171_717_171,
    });
    expect(video).not.toHaveProperty("uid");
    expect(video).not.toHaveProperty("claimToken");
    expect(video).not.toHaveProperty("status");
  });

  it("drops fields with the wrong type", () => {
    expect(
      toPublicVideo(legacyId, {
        filename: 42,
        title: null,
        renditions: "720p",
      }),
    ).toEqual({ id: legacyId, uploadedAt: 1_717_171_717_171 });
  });
});
