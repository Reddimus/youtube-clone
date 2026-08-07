import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "standalone",
  // The app lives in an npm workspace, so file tracing has to start at the
  // repo root or the standalone bundle misses the linked @yt/contract package.
  outputFileTracingRoot: path.join(here, ".."),
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["firebase"],
  },
};

export default nextConfig;
