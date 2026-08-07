import { createProcessingApp } from "./app";
import { claimVideo, completeVideo, failVideo } from "./firestore";
import { defaultRawVideoBucketName } from "./pubsub";
import {
  convertVideo,
  deleteProcessedVideo,
  deleteRawVideo,
  downloadRawVideo,
  setupDirectories,
  uploadProcessedVideo,
} from "./storage";

async function start(): Promise<void> {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  await setupDirectories();

  const app = createProcessingApp({
    rawVideoBucketName:
      process.env.RAW_VIDEO_BUCKET ?? defaultRawVideoBucketName,
    claimVideo,
    completeVideo,
    failVideo,
    downloadRawVideo,
    convertVideo,
    uploadProcessedVideo,
    deleteRawVideo,
    deleteProcessedVideo,
  });

  app.listen(port, () => {
    console.log(`Video processing service listening on port ${port}.`);
  });
}

void start().catch((error: unknown) => {
  console.error("Video processing service failed to start.", error);
  process.exitCode = 1;
});
