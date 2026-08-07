import { describe, expect, it } from "vitest";

import {
  createRawVideoFileName,
  contentTypeForVideoExtension,
  encodeUserId,
  maxUploadBytes,
  normalizeUploadSize,
  normalizeVideoExtension,
  toPublicVideo,
} from "./video";

describe("normalizeVideoExtension", () => {
  it("normalizes an allowed extension", () => {
    expect(normalizeVideoExtension(" MP4 ")).toBe("mp4");
  });

  it.each([undefined, "", "exe", "../mp4", "mp4/other"])(
    "rejects unsafe extension %s",
    (extension) => {
      expect(() => normalizeVideoExtension(extension)).toThrow();
    },
  );
});

describe("upload constraints", () => {
  it("maps each extension to a canonical content type", () => {
    expect(contentTypeForVideoExtension("mp4")).toBe("video/mp4");
    expect(contentTypeForVideoExtension("MOV")).toBe("video/quicktime");
  });

  it.each([0, -1, maxUploadBytes + 1, 1.5, "100"])(
    "rejects invalid upload size %s",
    (size) => {
      expect(() => normalizeUploadSize(size)).toThrow();
    },
  );
});

describe("createRawVideoFileName", () => {
  it("encodes the UID and produces a storage-safe deterministic name", () => {
    const uploadId = "123e4567-e89b-42d3-a456-426614174000";
    expect(
      createRawVideoFileName(
        "person/example",
        "webm",
        1_725_000_000_000,
        uploadId,
      ),
    ).toBe(
      `u~${encodeUserId("person/example")}~1725000000000~${uploadId}.webm`,
    );
  });

  it("uses a unique upload ID when calls share a timestamp", () => {
    const first = createRawVideoFileName("user", "mp4", 1_725_000_000_000);
    const second = createRawVideoFileName("user", "mp4", 1_725_000_000_000);

    expect(first).not.toBe(second);
  });

  it.each([999_999_999_999, 10_000_000_000_000, 1.5])(
    "rejects invalid timestamp %s",
    (timestamp) => {
      expect(() => createRawVideoFileName("user", "mp4", timestamp)).toThrow();
    },
  );
});

describe("encodeUserId", () => {
  it.each(["", "é".repeat(65)])("rejects invalid UTF-8 byte length", (uid) => {
    expect(() => encodeUserId(uid)).toThrow();
  });
});

describe("toPublicVideo", () => {
  it("omits internal ownership and claim fields", () => {
    expect(
      toPublicVideo("video-id", {
        filename: "processed-video.mp4",
        title: "Example",
        uid: "private-user-id",
        claimToken: "private-claim-token",
        status: "processed",
      }),
    ).toEqual({
      id: "video-id",
      filename: "processed-video.mp4",
      title: "Example",
    });
  });
});
