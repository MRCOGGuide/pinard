"use client";

/**
 * When the root layout itself fails, so neither the header, the fonts
 * nor the stylesheet can be relied on. Plain HTML with the palette
 * written in, and nothing about the error but its reference.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en-GB">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#F7F8F5",
          color: "#1C2421",
          fontFamily: "system-ui, sans-serif",
          display: "grid",
          placeItems: "center",
          padding: "16px",
        }}
      >
        <main role="alert" style={{ maxWidth: 480 }}>
          <h1 style={{ fontFamily: "Georgia, serif", color: "#0F3D33", fontSize: 32, margin: 0 }}>
            Pinard did not load
          </h1>
          <p style={{ fontSize: 17, lineHeight: 1.6 }}>
            Something went wrong on our side. Your progress is saved, so trying
            again is safe.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              height: 44,
              padding: "0 20px",
              border: 0,
              borderRadius: 10,
              background: "#0F3D33",
              color: "#fff",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p style={{ fontSize: 14, opacity: 0.7 }}>Reference {error.digest}</p>
          )}
        </main>
      </body>
    </html>
  );
}
