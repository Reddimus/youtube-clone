import { describe, expect, it } from "vitest";

import { maxUploadBytes, validateRawVideoSize } from "./storage";

describe("validateRawVideoSize", () => {
  it("accepts numeric storage metadata up to the configured maximum", () => {
    expect(validateRawVideoSize(String(maxUploadBytes))).toBe(maxUploadBytes);
  });

  it.each([undefined, "", "not-a-number", 0, -1, maxUploadBytes + 1, 1.5])(
    "rejects invalid object size %s",
    (size) => {
      expect(() => validateRawVideoSize(size)).toThrow();
    },
  );
});
