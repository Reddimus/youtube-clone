/**
 * The Redd mark: a single film frame, sprockets on the left, play on the right.
 *
 * Authored here rather than shipped as an asset so it inherits `currentColor`
 * and stays legible in both themes. It replaces the literal YouTube wordmark
 * this project used to render, which was both a trademark to avoid and
 * hardcoded near-black — invisible against the dark background.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="2.9"
        y="4.4"
        width="18.2"
        height="15.2"
        rx="3.2"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <rect
        x="5.6"
        y="7.7"
        width="2.1"
        height="2.7"
        rx="0.8"
        fill="currentColor"
      />
      <rect
        x="5.6"
        y="13.6"
        width="2.1"
        height="2.7"
        rx="0.8"
        fill="currentColor"
      />
      <path
        d="M11.2 8.6 17.4 12l-6.2 3.4V8.6Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
