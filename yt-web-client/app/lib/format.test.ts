import { describe, expect, it } from "vitest";

import { formatBytes, formatDate, formatRelativeTime, videoTitle } from "./format";

const uploadedAt = 1_717_171_717_171; // 2024-05-31T15:28:37Z

describe("videoTitle", () => {
  it("prefers the stored title", () => {
    expect(videoTitle({ id: "a", title: "  Holiday  " })).toBe("Holiday");
  });

  it("falls back to the upload date when the title is missing or blank", () => {
    expect(videoTitle({ id: "a", title: "   ", uploadedAt })).toBe(
      `Untitled — ${formatDate(uploadedAt)}`,
    );
  });

  it("falls back again when there is no date either", () => {
    expect(videoTitle({ id: "a" })).toBe("Untitled video");
  });
});

describe("formatRelativeTime", () => {
  const now = uploadedAt;

  it.each([
    [now - 30_000, "30 seconds ago"],
    [now - 5 * 60_000, "5 minutes ago"],
    [now - 3 * 3_600_000, "3 hours ago"],
    [now - 2 * 86_400_000, "2 days ago"],
    [now - 40 * 86_400_000, "last month"],
    [now - 400 * 86_400_000, "last year"],
  ])("formats %j as %j", (timestamp, expected) => {
    expect(formatRelativeTime(timestamp, now)).toBe(expected);
  });
});

describe("formatBytes", () => {
  it.each([
    [0, "0 B"],
    [512, "512 B"],
    [1024, "1.0 KiB"],
    [1536, "1.5 KiB"],
    [10 * 1024 * 1024, "10 MiB"],
    [250 * 1024 * 1024, "250 MiB"],
    [3 * 1024 * 1024 * 1024, "3.0 GiB"],
  ])("formats %j as %j", (bytes, expected) => {
    expect(formatBytes(bytes)).toBe(expected);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "returns a dash for %j",
    (bytes) => {
      expect(formatBytes(bytes)).toBe("—");
    },
  );
});

describe("formatDate", () => {
  it("formats in UTC so the output is stable across machines", () => {
    expect(formatDate(uploadedAt)).toBe("May 31, 2024");
  });
});
