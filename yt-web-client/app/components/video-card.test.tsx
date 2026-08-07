import type { PublicVideo } from "@yt/contract";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { VideoCard } from "./video-card";

const videoId =
  "u~dWlkLTEyMw~1717171717171~0f9d2f2f-6a3a-4b1e-9c2e-2f1a5b6c7d8e";

function makeVideo(overrides: Partial<PublicVideo> = {}): PublicVideo {
  return {
    id: videoId,
    filename: `processed-${videoId}-360p.mp4`,
    title: "Coastline at dusk",
    renditions: ["360p", "720p"],
    uploadedAt: 1_717_171_717_171,
    ...overrides,
  };
}

describe("VideoCard", () => {
  it("gives the link the video's title as its accessible name", () => {
    render(<VideoCard video={makeVideo()} />);
    // Every card used to announce the identical string "Video thumbnail",
    // which made the feed unusable with a screen reader.
    expect(
      screen.getByRole("link", { name: /Coastline at dusk/ }),
    ).toHaveAttribute("href", `/watch/${encodeURIComponent(videoId)}`);
  });

  it("shows the description and rendition ladder when present", () => {
    render(
      <VideoCard video={makeVideo({ description: "Shot on a phone." })} />,
    );
    expect(screen.getByText("Shot on a phone.")).toBeInTheDocument();
    expect(screen.getByText("360p / 720p")).toBeInTheDocument();
  });

  it("falls back to a dated title when none was supplied", () => {
    render(<VideoCard video={makeVideo({ title: undefined })} />);
    expect(
      screen.getByRole("link", { name: /Untitled — May 31, 2024/ }),
    ).toBeInTheDocument();
  });

  it("shows the develop rail while the video has no output yet", () => {
    render(
      <VideoCard video={makeVideo({ filename: undefined, renditions: [] })} />,
    );
    expect(screen.getByRole("group")).toHaveAccessibleName(
      "Status: Developing…",
    );
  });

  it("omits the rail once the video is playable", () => {
    render(<VideoCard video={makeVideo()} />);
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });
});
