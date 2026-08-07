import type { MetadataRoute } from "next";

/**
 * Redd is an offline portfolio prototype — it is not hosted publicly.
 *
 * Disallowing everything means that if someone ever does stand it up on a
 * reachable host, it will not be indexed by accident.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
