import { createProcessingApp } from "./app";
import { claimVideo, completeVideo, failVideo } from "./firestore";
import { defaultRawVideoBucketName } from "./pubsub";
import { createVideoStorage } from "./storage";

async function start(): Promise<void> {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  const rawVideoBucketName =
    process.env.RAW_VIDEO_BUCKET ?? defaultRawVideoBucketName;
  const videoStorage = createVideoStorage({
    processedVideoBucketName:
      process.env.PROCESSED_VIDEO_BUCKET ?? "redd-processed-videos",
    rawVideoBucketName,
    workDir: process.env.WORK_DIR ?? process.cwd(),
  });
  await videoStorage.setupDirectories();

  const app = createProcessingApp({
    rawVideoBucketName,
    claimVideo,
    completeVideo,
    failVideo,
    convertVideo: videoStorage.convertVideo,
    deleteProcessedVideo: videoStorage.deleteProcessedVideo,
    deleteRawVideo: videoStorage.deleteRawVideo,
    downloadRawVideo: videoStorage.downloadRawVideo,
    uploadProcessedVideo: videoStorage.uploadProcessedVideo,
  });

  app.listen(port, () => {
    console.info(`Video processing service listening on port ${port}.`);
  });
}

void start().catch((error: unknown) => {
  console.error("Video processing service failed to start.", error);
  process.exitCode = 1;
});
