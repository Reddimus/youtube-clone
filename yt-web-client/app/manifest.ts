import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Redd — a small lab for your video",
    short_name: "Redd",
    description:
      "Upload a video, watch it develop through the transcoding pipeline, and share the link when it is ready.",
    start_url: "/",
    display: "standalone",
    background_color: "#f2f1ee",
    theme_color: "#f2f1ee",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
