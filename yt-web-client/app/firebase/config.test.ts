import { describe, expect, it } from "vitest";

import { readFirebaseConfig } from "./config";

const validEnvironment = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "example.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "example",
  NEXT_PUBLIC_FIREBASE_APP_ID: "app-id",
};

describe("readFirebaseConfig", () => {
  it("returns a trimmed Firebase client configuration", () => {
    expect(
      readFirebaseConfig({
        ...validEnvironment,
        NEXT_PUBLIC_FIREBASE_API_KEY: " api-key ",
        NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: " measurement-id ",
      }),
    ).toEqual({
      apiKey: "api-key",
      authDomain: "example.firebaseapp.com",
      projectId: "example",
      appId: "app-id",
      measurementId: "measurement-id",
    });
  });

  it("reports every missing required variable", () => {
    expect(() => readFirebaseConfig({})).toThrow(
      "NEXT_PUBLIC_FIREBASE_API_KEY, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, " +
        "NEXT_PUBLIC_FIREBASE_PROJECT_ID, NEXT_PUBLIC_FIREBASE_APP_ID",
    );
  });
});
