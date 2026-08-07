export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  measurementId?: string;
}

type FirebaseEnvironment = Record<string, string | undefined>;

const requiredVariables = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
] as const;

/**
 * Reads and validates the public Firebase web configuration.
 *
 * Firebase web configuration is intentionally public, but every required field
 * must still be present before the browser SDK is initialized.
 */
export function readFirebaseConfig(
  environment: FirebaseEnvironment,
): FirebaseClientConfig {
  const missing = requiredVariables.filter(
    (name) => !environment[name]?.trim(),
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing required Firebase configuration: ${missing.join(", ")}`,
    );
  }

  const measurementId =
    environment.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID?.trim();

  return {
    apiKey: environment.NEXT_PUBLIC_FIREBASE_API_KEY!.trim(),
    authDomain: environment.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!.trim(),
    projectId: environment.NEXT_PUBLIC_FIREBASE_PROJECT_ID!.trim(),
    appId: environment.NEXT_PUBLIC_FIREBASE_APP_ID!.trim(),
    ...(measurementId ? { measurementId } : {}),
  };
}
