export { uploadTimestamp } from "@yt/contract";

export type VideoClaimResult =
  | { status: "claimed"; token: string }
  | { status: "processed" }
  | { status: "permanent-failure" }
  | { status: "leased" };

export interface ProcessingAttempt {
  claimToken: string;
  deadlineMilliseconds: number;
}

export interface VideoFailure {
  permanent: boolean;
  reason: string;
}
