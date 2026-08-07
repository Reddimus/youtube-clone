import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Sans } from "next/font/google";

import { SiteHeader } from "./components/site-header";
import { ToastProvider } from "./components/toast";
import "./globals.css";
import styles from "./layout.module.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-bricolage",
  display: "swap",
});

const body = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

// Redd is not hosted publicly; localhost is the honest default and keeps
// generated absolute URLs pointing at wherever it is actually being run.
// `||` rather than `??`: an unset Docker ARG becomes an empty string, not
// undefined, and `new URL("")` throws during the production build.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Redd — a small lab for your video",
    template: "%s · Redd",
  },
  description:
    "Upload a video, watch it develop through the transcoding pipeline, and share the link when it is ready.",
  applicationName: "Redd",
  openGraph: {
    type: "website",
    siteName: "Redd",
    title: "Redd — a small lab for your video",
    description:
      "Upload a video, watch it develop through the transcoding pipeline, and share the link when it is ready.",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "Redd — a small lab for your video",
    description:
      "Upload a video, watch it develop through the transcoding pipeline, and share the link when it is ready.",
  },
  // Matches app/robots.ts: this is an offline portfolio prototype, so it must
  // not be indexed if it is ever stood up on a reachable host.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f1ee" },
    { media: "(prefers-color-scheme: dark)", color: "#16181c" },
  ],
};

/**
 * Applies the stored theme before first paint.
 *
 * Without this the page renders in the system theme and then snaps to the
 * stored choice, which reads as a flash of the wrong colours.
 */
const themeScript = `
(function () {
  try {
    var stored = localStorage.getItem("redd-theme");
    if (stored === "light" || stored === "dark") {
      document.documentElement.dataset.theme = stored;
    }
  } catch (error) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <a className="skipLink" href="#main">
          Skip to content
        </a>
        <ToastProvider>
          <div className={styles.shell}>
            <SiteHeader />
            <main id="main" className={styles.main} tabIndex={-1}>
              {children}
            </main>
            <footer className={styles.footer}>
              <p>
                Redd develops every upload into a 360p and 720p rendition on
                Cloud Run.
              </p>
            </footer>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
