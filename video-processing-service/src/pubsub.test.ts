import { describe, expect, it } from "vitest";

import { parseVideoObjectName, parseVideoUploadRequest } from "./pubsub";

function requestFor(event: unknown) {
  return {
    message: {
      data: Buffer.from(JSON.stringify(event), "utf8").toString("base64"),
    },
  };
}

describe("parseVideoObjectName", () => {
  it("parses a storage-safe encoded UID", () => {
    const encodedUid = Buffer.from("person/example", "utf8").toString(
      "base64url",
    );
    const uploadId = "123e4567-e89b-42d3-a456-426614174000";

    expect(
      parseVideoObjectName(
        `u~${encodedUid}~1725000000000~${uploadId}.webm`,
      ),
    ).toEqual({
      inputFileName: `u~${encodedUid}~1725000000000~${uploadId}.webm`,
      outputFileName: `processed-u~${encodedUid}~1725000000000~${uploadId}.mp4`,
      videoId: `u~${encodedUid}~1725000000000~${uploadId}`,
      uid: "person/example",
    });
  });

  it.each([
    "../video.mp4",
    "folder/video.mp4",
    "user-1725000000000.exe",
    "processed-user-1725000000000.mp4",
    "u~__8~1725000000000~123e4567-e89b-42d3-a456-426614174000.mp4",
    "user-172500000000.mp4",
    "user-17250000000000.mp4",
  ])("rejects unsafe object name %s", (name) => {
    expect(() => parseVideoObjectName(name)).toThrow();
  });
});

describe("parseVideoUploadRequest", () => {
  it("accepts an event from the configured raw bucket", () => {
    expect(
      parseVideoUploadRequest(
        requestFor({
          bucket: "raw-videos",
          name: "user-1725000000000.mp4",
        }),
        "raw-videos",
      ).videoId,
    ).toBe("user-1725000000000");
  });

  it("rejects malformed envelopes, base64, JSON, and unexpected buckets", () => {
    expect(() => parseVideoUploadRequest({})).toThrow();
    expect(() =>
      parseVideoUploadRequest({ message: { data: "not-base64" } }),
    ).toThrow();
    expect(() =>
      parseVideoUploadRequest(
        requestFor({ bucket: "other", name: "user-1725000000000.mp4" }),
        "raw-videos",
      ),
    ).toThrow("unexpected bucket");
    expect(() =>
      parseVideoUploadRequest(
        requestFor({ name: "user-1725000000000.mp4" }),
        "raw-videos",
      ),
    ).toThrow("unexpected bucket");
  });
});
