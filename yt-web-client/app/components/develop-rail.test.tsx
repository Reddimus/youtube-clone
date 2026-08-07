import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DevelopRail } from "./develop-rail";

describe("DevelopRail", () => {
  it("announces the current stage", () => {
    render(<DevelopRail stage="developing" />);
    expect(screen.getByRole("group")).toHaveAccessibleName(
      "Status: Developing…",
    );
  });

  it("drops the ellipsis once the video is ready", () => {
    render(<DevelopRail stage="ready" />);
    expect(screen.getByRole("group")).toHaveAccessibleName("Status: Ready");
  });

  it("reports failure instead of a stage name", () => {
    render(<DevelopRail stage="developing" failed />);
    expect(screen.getByRole("group")).toHaveAccessibleName(
      "Status: Processing failed",
    );
  });

  it("always labels all three stages for assistive technology", () => {
    render(<DevelopRail stage="uploaded" />);
    for (const label of ["Uploaded", "Developing", "Ready"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("hides the text label in compact mode but keeps the group name", () => {
    render(<DevelopRail stage="developing" compact />);
    const group = screen.getByRole("group");
    expect(group).toHaveAccessibleName("Status: Developing…");
    expect(group.querySelectorAll("li")).toHaveLength(3);
  });
});
