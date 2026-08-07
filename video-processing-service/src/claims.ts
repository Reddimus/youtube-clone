export type VideoClaimResult =
  | { status: "claimed"; token: string }
  | { status: "processed" }
  | { status: "leased" };

export function uploadTimestamp(videoId: string): number | null {
  const match = /(?:-|~)(\d{13})(?:~[0-9a-f-]{36})?$/i.exec(videoId);
  if (!match) {
    return null;
  }

  const timestamp = Number(match[1]);
  return Number.isSafeInteger(timestamp) ? timestamp : null;
}
