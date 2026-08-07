import { describe, expect, it } from "vitest";

import {
  contentTypesByExtension,
  defaultRenditionName,
  isVideoExtension,
  legacyRawVideoNamePattern,
  processedVideoName,
  rawVideoNamePattern,
  sortRenditionsByHeight,
  uploadIdPattern,
  videoRenditions,
  type RenditionName,
} from "./index";

describe("rendition ladder", () => {
  it("is ordered smallest first and strictly ascending", () => {
    const heights = videoRenditions.map((rendition) => rendition.height);
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
    expect(new Set(heights).size).toBe(heights.length);
  });

  it("gives every rendition a positive bitrate cap", () => {
    for (const rendition of videoRenditions) {
      expect(rendition.maxBitrateKbps).toBeGreaterThan(0);
    }
  });

  it("defaults to the smallest rendition, so the cheapest output always exists", () => {
    expect(defaultRenditionName).toBe(videoRenditions[0].name);
  });
});

describe("sortRenditionsByHeight", () => {
  it("orders by real pixel height, not lexically", () => {
    expect(sortRenditionsByHeight(["720p", "360p"])).toEqual(["360p", "720p"]);
  });

  it("does not mutate its input", () => {
    const input: RenditionName[] = ["720p", "360p"];
    sortRenditionsByHeight(input);
    expect(input).toEqual(["720p", "360p"]);
  });

  it("handles empty and single-item lists", () => {
    expect(sortRenditionsByHeight([])).toEqual([]);
    expect(sortRenditionsByHeight(["720p"])).toEqual(["720p"]);
  });

  it("sorts unknown names to the front rather than throwing", () => {
    expect(sortRenditionsByHeight(["720p", "1080p" as RenditionName])).toEqual([
      "1080p",
      "720p",
    ]);
  });
});

describe("processedVideoName", () => {
  it("rejects a video ID that would produce an unsafe object name", () => {
    expect(() => processedVideoName("../../etc/passwd", "360p")).toThrow(
      "The processed video name is invalid.",
    );
  });
});

describe("isVideoExtension", () => {
  it.each(["mp4", "mov", "webm", "m4v"])("accepts %j", (value) => {
    expect(isVideoExtension(value)).toBe(true);
  });

  it.each(["MP4", "avi", "", 4, null, undefined])("rejects %j", (value) => {
    expect(isVideoExtension(value)).toBe(false);
  });
});

describe("exported patterns", () => {
  it("maps exactly the allowed extensions to content types", () => {
    expect(Object.keys(contentTypesByExtension).sort()).toEqual([
      "m4v",
      "mov",
      "mp4",
      "webm",
    ]);
  });

  it("accepts a v4 upload ID and rejects other UUID versions", () => {
    expect(uploadIdPattern.test("0f9d2f2f-6a3a-4b1e-9c2e-2f1a5b6c7d8e")).toBe(
      true,
    );
    expect(uploadIdPattern.test("0f9d2f2f-6a3a-1b1e-9c2e-2f1a5b6c7d8e")).toBe(
      false,
    );
  });

  it("keeps the raw and legacy name patterns distinct", () => {
    const encoded =
      "u~dWlkLTEyMw~1717171717171~0f9d2f2f-6a3a-4b1e-9c2e-2f1a5b6c7d8e.mp4";
    const legacy = "uid123-1717171717171.mp4";

    expect(rawVideoNamePattern.test(encoded)).toBe(true);
    expect(rawVideoNamePattern.test(legacy)).toBe(false);
    expect(legacyRawVideoNamePattern.test(legacy)).toBe(true);
    expect(legacyRawVideoNamePattern.test(encoded)).toBe(false);
  });
});
