export { uploadTimestamp } from "@yt/contract";

export type VideoClaimResult =
  | { status: "claimed"; token: string }
  | { status: "processed" }
  | { status: "leased" };
