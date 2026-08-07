import { describe, expect, it } from "vitest";

import { parseVideoUploadRequest } from "./pubsub";

function requestFor(event: unknown) {
  return {
    message: {
      data: Buffer.from(JSON.stringify(event), "utf8").toString("base64"),
    },
  };
}

describe("parseVideoUploadRequest", () => {
  it("parses a storage-safe encoded UID and creates the rendition ladder", () => {
    const encodedUid = Buffer.from("person/example", "utf8").toString(
      "base64url",
    );
    const uploadId = "123e4567-e89b-42d3-a456-426614174000";

    expect(
      parseVideoUploadRequest(
        requestFor({
          bucket: "raw-videos",
          name: `u~${encodedUid}~1725000000000~${uploadId}.webm`,
        }),
        "raw-videos",
      ),
    ).toEqual({
      inputFileName: `u~${encodedUid}~1725000000000~${uploadId}.webm`,
      outputFileNames: [
        {
          fileName: `processed-u~${encodedUid}~1725000000000~${uploadId}-360p.mp4`,
          rendition: "360p",
        },
        {
          fileName: `processed-u~${encodedUid}~1725000000000~${uploadId}-720p.mp4`,
          rendition: "720p",
        },
      ],
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
    expect(() =>
      parseVideoUploadRequest(
        requestFor({ bucket: "raw-videos", name }),
        "raw-videos",
      ),
    ).toThrow();
  });

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
    expect(() => parseVideoUploadRequest({ message: { data: "e30" } })).toThrow(
      "canonical base64",
    );
    expect(() =>
      parseVideoUploadRequest({ message: { data: "!!!!" } }),
    ).toThrow("canonical base64");
    expect(() =>
      parseVideoUploadRequest({
        message: { data: Buffer.from("not json").toString("base64") },
      }),
    ).toThrow("contain JSON");
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
    expect(() =>
      parseVideoUploadRequest(requestFor("not-an-event"), "raw-videos"),
    ).toThrow("storage event");
  });
});
