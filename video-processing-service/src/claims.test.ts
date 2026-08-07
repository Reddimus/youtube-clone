import { describe, expect, it } from "vitest";

import { uploadTimestamp } from "./claims";

describe("uploadTimestamp", () => {
  it("reads new and legacy video IDs", () => {
    expect(
      uploadTimestamp(
        "u~dXNlcg~1725000000000~123e4567-e89b-42d3-a456-426614174000",
      ),
    ).toBe(1_725_000_000_000);
    expect(uploadTimestamp("legacy-user-1725000000000")).toBe(
      1_725_000_000_000,
    );
  });

  it("returns null for an invalid video ID", () => {
    expect(uploadTimestamp("video-without-a-timestamp")).toBeNull();
  });
});
