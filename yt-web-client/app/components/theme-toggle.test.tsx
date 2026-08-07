import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ThemeToggle } from "./theme-toggle";

beforeEach(() => {
  delete document.documentElement.dataset.theme;
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ThemeToggle", () => {
  it("offers both labels so the correct one is exposed in either theme", () => {
    render(<ThemeToggle />);
    // CSS decides which is visible; both exist in the DOM so the button always
    // has an accessible name without React tracking the theme.
    expect(screen.getByText("Switch to dark theme")).toBeInTheDocument();
    expect(screen.getByText("Switch to light theme")).toBeInTheDocument();
  });

  it("flips to dark and persists the choice", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button"));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("redd-theme")).toBe("dark");
  });

  it("flips back to light on a second press", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button"));
    await user.click(screen.getByRole("button"));

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(window.localStorage.getItem("redd-theme")).toBe("light");
  });

  it("respects the system preference when nothing has been chosen", async () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
    } as MediaQueryList);
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button"));

    // System is dark and no explicit choice exists, so the first press goes light.
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("still toggles when storage is unavailable", async () => {
    // Pinned so the assertion does not depend on the ambient system theme.
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: false,
    } as MediaQueryList);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button"));

    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
