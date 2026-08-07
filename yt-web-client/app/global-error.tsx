"use client";

/**
 * Last-resort boundary: this replaces the root layout, so it must render its
 * own <html> and cannot rely on any app styles or fonts.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "2rem",
          fontFamily: "system-ui, sans-serif",
          background: "#f2f1ee",
          color: "#15171a",
        }}
      >
        <main style={{ maxWidth: "34rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.75rem", marginBottom: "0.75rem" }}>
            Redd could not start
          </h1>
          <p style={{ color: "#545a63", marginBottom: "1.5rem" }}>
            The application failed before it could render.
            {error.digest ? ` Reference: ${error.digest}.` : ""}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: "2.75rem",
              padding: "0 1.5rem",
              border: "1px solid #bcb9b2",
              borderRadius: "999px",
              background: "#fff",
              font: "inherit",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
