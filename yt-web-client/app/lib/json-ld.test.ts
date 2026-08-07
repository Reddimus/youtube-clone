import { describe, expect, it } from "vitest";

import { toJsonLd } from "./json-ld";

const lineSeparator = "\u2028";
const paragraphSeparator = "\u2029";

describe("toJsonLd", () => {
  it("escapes a script-closing sequence in user-supplied text", () => {
    const payload = toJsonLd({
      name: "</script><script>alert(document.domain)</script>",
    });

    // The exploit is the literal "</script>" reaching the HTML parser.
    expect(payload).not.toContain("</script>");
    expect(payload).not.toContain("<");
    expect(payload).toContain("\\u003c");
  });

  it("escapes the JavaScript line terminators that JSON permits raw", () => {
    const payload = toJsonLd({
      name: `a${lineSeparator}b${paragraphSeparator}c`,
    });

    expect(payload).not.toContain(lineSeparator);
    expect(payload).not.toContain(paragraphSeparator);
    expect(payload).toContain("\\u2028");
    expect(payload).toContain("\\u2029");
  });

  it("still round-trips to the original value", () => {
    const value = {
      "@type": "VideoObject",
      name: `</script> & <b>bold</b> ${lineSeparator}`,
      description: "Unicode check",
    };

    expect(JSON.parse(toJsonLd(value))).toEqual(value);
  });

  it("leaves ordinary content readable", () => {
    expect(toJsonLd({ name: "SMPTE colour bars" })).toBe(
      '{"name":"SMPTE colour bars"}',
    );
  });
});
