import { describe, expect, it } from "vitest";

import {
  buildRawVideoName,
  decodeUserId,
  encodeUserId,
  parseRawVideoName,
} from "./server";

const uuid = "0f9d2f2f-6a3a-4b1e-9c2e-2f1a5b6c7d8e";
const timestamp = 1_717_171_717_171;

describe("encodeUserId / decodeUserId", () => {
  it.each(["uid-123", "AbC_-123", "ユーザー", "a".repeat(128)])(
    "round-trips %j",
    (uid) => {
      expect(decodeUserId(encodeUserId(uid))).toBe(uid);
    },
  );

  it("rejects an empty or oversized UID", () => {
    expect(() => encodeUserId("")).toThrow(
      "The authenticated user ID is invalid.",
    );
    expect(() => encodeUserId("a".repeat(129))).toThrow(
      "The authenticated user ID is invalid.",
    );
  });

  it("rejects a non-canonical encoding", () => {
    expect(() => decodeUserId("dWlkLTEyMw==")).toThrow(
      "The video object contains an invalid user ID.",
    );
    expect(() => decodeUserId("")).toThrow();
  });
});

describe("buildRawVideoName", () => {
  it("builds the canonical name", () => {
    expect(buildRawVideoName("uid-123", "mp4", timestamp, uuid)).toBe(
      `u~dWlkLTEyMw~${timestamp}~${uuid}.mp4`,
    );
  });

  it("produces a distinct name on every call", () => {
    const names = new Set(
      Array.from({ length: 25 }, () => buildRawVideoName("uid-123", "mp4")),
    );
    expect(names.size).toBe(25);
  });

  it.each([0, 999_999_999_999, 10_000_000_000_000, 1.5])(
    "rejects timestamp %j",
    (value) => {
      expect(() => buildRawVideoName("uid-123", "mp4", value, uuid)).toThrow(
        "The upload timestamp is invalid.",
      );
    },
  );

  it.each(["not-a-uuid", "0f9d2f2f-6a3a-1b1e-9c2e-2f1a5b6c7d8e"])(
    "rejects upload ID %j",
    (value) => {
      expect(() =>
        buildRawVideoName("uid-123", "mp4", timestamp, value),
      ).toThrow("The upload ID is invalid.");
    },
  );

  it("round-trips through parseRawVideoName", () => {
    const name = buildRawVideoName("ユーザー", "webm", timestamp, uuid);
    expect(parseRawVideoName(name)).toEqual({
      inputFileName: name,
      videoId: name.slice(0, name.lastIndexOf(".")),
      uid: "ユーザー",
    });
  });
});

describe("parseRawVideoName", () => {
  it("parses the legacy name shape", () => {
    expect(parseRawVideoName(`uid123-${timestamp}.mp4`)).toEqual({
      inputFileName: `uid123-${timestamp}.mp4`,
      videoId: `uid123-${timestamp}`,
      uid: "uid123",
    });
  });

  it("refuses to reprocess a processed object", () => {
    expect(() =>
      parseRawVideoName(`processed-uid123-${timestamp}.mp4`),
    ).toThrow("Processed videos cannot be submitted for processing.");
  });

  it.each([
    "../../etc/passwd.mp4",
    "uid123.mp4",
    `uid123-${timestamp}.exe`,
    `u~~${timestamp}~${uuid}.mp4`,
    `u~dWlkLTEyMw~${timestamp}~not-a-uuid.mp4`,
    "",
  ])("rejects %j", (value) => {
    expect(() => parseRawVideoName(value)).toThrow();
  });

  it.each([undefined, null, 12, {}])("rejects non-string %j", (value) => {
    expect(() => parseRawVideoName(value)).toThrow(
      "The storage event is missing an object name.",
    );
  });
});
