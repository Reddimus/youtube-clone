import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { VideoSource } from "../firebase/storage";
import { VideoPlayer } from "./video-player";

const sources: VideoSource[] = [
  { rendition: "720p", label: "720p", url: "/samples/clip-720p.mp4" },
  { rendition: "360p", label: "360p", url: "/samples/clip-360p.mp4" },
];

describe("VideoPlayer", () => {
  it("plays the highest rendition first", () => {
    render(<VideoPlayer sources={sources} title="Coastline" />);
    expect(screen.getByLabelText("Coastline")).toHaveAttribute(
      "src",
      "/samples/clip-720p.mp4",
    );
  });

  it("exposes the ladder as a radio group and switches source on select", async () => {
    const user = userEvent.setup();
    render(<VideoPlayer sources={sources} title="Coastline" />);

    const group = screen.getByRole("radiogroup", { name: "Quality" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "720p" })).toBeChecked();

    await user.click(screen.getByRole("radio", { name: "360p" }));

    expect(screen.getByRole("radio", { name: "360p" })).toBeChecked();
    expect(screen.getByLabelText("Coastline")).toHaveAttribute(
      "src",
      "/samples/clip-360p.mp4",
    );
  });

  it("hides the switcher when there is only one rendition", () => {
    render(<VideoPlayer sources={[sources[0]]} title="Coastline" />);
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("explains itself when a video has no playable rendition", () => {
    render(<VideoPlayer sources={[]} title="Coastline" />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "no playable rendition",
    );
  });

  it("shows a recoverable message instead of a broken player on load failure", () => {
    render(<VideoPlayer sources={sources} title="Coastline" />);
    fireEvent.error(screen.getByLabelText("Coastline"));
    expect(screen.getByRole("alert")).toHaveTextContent("could not be loaded");
  });
});
