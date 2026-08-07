import { maxUploadBytes } from "@yt/contract";
import { describe, expect, it } from "vitest";

import { getVideoExtension, validateVideoFileSize } from "./functions";

describe("getVideoExtension", () => {
  it.each([
    ["clip.mp4", "mp4"],
    ["Clip.MOV", "mov"],
    ["holiday.final.webm", "webm"],
    ["a.m4v", "m4v"],
  ])("reads %j as %j", (fileName, expected) => {
    expect(getVideoExtension(fileName)).toBe(expected);
  });

  it.each(["clip.avi", "clip.mkv", "clip", "clip.mp4.exe", ""])(
    "rejects %j",
    (fileName) => {
      expect(() => getVideoExtension(fileName)).toThrow(
        "Choose an MP4, MOV, WebM, or M4V video file.",
      );
    },
  );
});

describe("validateVideoFileSize", () => {
  it("accepts the boundaries", () => {
    expect(() => {
      validateVideoFileSize(1);
    }).not.toThrow();
    expect(() => {
      validateVideoFileSize(maxUploadBytes);
    }).not.toThrow();
  });

  it.each([0, -1, 1.5, maxUploadBytes + 1, Number.NaN])(
    "rejects %j",
    (size) => {
      expect(() => {
        validateVideoFileSize(size);
      }).toThrow("Choose a non-empty video no larger than 250 MiB.");
    },
  );
});
