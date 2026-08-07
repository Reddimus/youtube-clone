/**
 * Serializes a value for embedding inside a `<script type="application/ld+json">`.
 *
 * `JSON.stringify` does not escape `<`, so a video title containing
 * `</script><script>...` would close the JSON-LD block and inject an executable
 * script element. Titles and descriptions are user-supplied, so this escaping is
 * load-bearing, not cosmetic.
 *
 * U+2028 and U+2029 get the same treatment: they are legal inside a JSON string
 * but are line terminators in JavaScript source, so emitting them raw breaks the
 * surrounding script. They are written below as escape sequences rather than
 * literal characters for exactly that reason.
 */
export function toJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
