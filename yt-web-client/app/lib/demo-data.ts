import type { PublicVideo } from "@yt/contract";

const demoUser = "ZGVtby11c2Vy"; // base64url("demo-user")

function demoVideo(
  timestamp: number,
  uploadId: string,
  title: string,
  description: string,
): PublicVideo {
  const id = `u~${demoUser}~${timestamp}~${uploadId}`;

  return {
    id,
    filename: `processed-${id}-360p.mp4`,
    title,
    description,
    renditions: ["360p", "720p"],
    uploadedAt: timestamp,
  };
}

/**
 * The seeded feed used in demo mode.
 *
 * These IDs match the sample files committed under `public/samples`, and they
 * use the real `u~<base64url uid>~<ms>~<uuid>` grammar so the demo exercises
 * the same name parsing and validation the live pipeline does.
 */
export const demoVideos: readonly PublicVideo[] = [
  demoVideo(
    1_722_528_000_000,
    "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e",
    "RGB alignment pass",
    "A channel-separation chart used to check that the encoder is not shifting colour between renditions.",
  ),
  demoVideo(
    1_719_849_600_000,
    "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
    "SMPTE colour bars",
    "The standard bar pattern, transcoded through the same ffmpeg ladder the production pipeline uses.",
  ),
  demoVideo(
    1_717_171_717_171,
    "0f9d2f2f-6a3a-4b1e-9c2e-2f1a5b6c7d8e",
    "SMPTE HD bars with tone",
    "An HD bar pattern with a 320 Hz reference tone, so audio and video are both exercised end to end.",
  ),
];
