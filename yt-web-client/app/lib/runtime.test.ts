import { afterEach, describe, expect, it, vi } from "vitest";

import { demoMediaBase, isDemoMode } from "./runtime";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isDemoMode", () => {
  it("is on when explicitly enabled, whatever else is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "redd-2aa7b");
    expect(isDemoMode()).toBe(true);
  });

  it("is off when explicitly disabled, even with no project configured", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "");
    expect(isDemoMode()).toBe(false);
  });

  it("turns itself on when no Firebase project is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "");
    // This is what makes a fresh clone work with no setup at all.
    expect(isDemoMode()).toBe(true);
  });

  it("stays off once a Firebase project is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "redd-2aa7b");
    expect(isDemoMode()).toBe(false);
  });

  it.each(["TRUE", " True "])("accepts %j as enabled", (value) => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", value);
    expect(isDemoMode()).toBe(true);
  });

  it("serves demo media from a site-relative path", () => {
    expect(demoMediaBase).toBe("/samples");
  });
});
