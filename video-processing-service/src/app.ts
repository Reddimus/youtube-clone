import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import { defaultRenditionName, type RenditionName } from "@yt/contract";

import type { VideoClaimResult } from "./claims";
import { parseVideoUploadRequest, type VideoOutputFile } from "./pubsub";

export interface ProcessingDependencies {
  rawVideoBucketName: string;
  claimVideo: (videoId: string, uid: string) => Promise<VideoClaimResult>;
  completeVideo: (
    videoId: string,
    claimToken: string,
    filename: string,
    renditions: RenditionName[],
  ) => Promise<boolean>;
  failVideo: (videoId: string, claimToken: string) => Promise<void>;
  downloadRawVideo: (fileName: string) => Promise<void>;
  convertVideo: (
    inputFileName: string,
    outputFileNames: readonly VideoOutputFile[],
  ) => Promise<VideoOutputFile[]>;
  uploadProcessedVideo: (fileName: string) => Promise<void>;
  deleteRawVideo: (fileName: string) => Promise<void>;
  deleteProcessedVideo: (fileName: string) => Promise<void>;
}

export function createProcessingApp(
  dependencies: ProcessingDependencies,
): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "256kb" }));

  app.get("/healthz", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.post("/process-video", async (request, response) => {
    let event;
    try {
      event = parseVideoUploadRequest(
        request.body,
        dependencies.rawVideoBucketName,
      );
    } catch (error) {
      console.warn("Rejected invalid video processing request.", error);
      // A malformed push message cannot become valid on retry. Acknowledge it
      // after logging so a poison message cannot consume the subscription.
      response.status(204).send();
      return;
    }

    let claimToken: string | null = null;
    let processingFailed = false;
    try {
      const claim = await dependencies.claimVideo(event.videoId, event.uid);
      if (claim.status === "processed") {
        response.status(204).send();
        return;
      }
      if (claim.status === "leased") {
        response.set("Retry-After", "30").status(503).json({
          error: "Video processing is already in progress.",
        });
        return;
      }
      claimToken = claim.token;

      await dependencies.downloadRawVideo(event.inputFileName);
      const outputs = await dependencies.convertVideo(
        event.inputFileName,
        event.outputFileNames,
      );
      await Promise.all(
        outputs.map((output) =>
          dependencies.uploadProcessedVideo(output.fileName),
        ),
      );
      const defaultOutput = outputs.find(
        (output) => output.rendition === defaultRenditionName,
      );
      if (!defaultOutput) {
        throw new Error("The default video rendition was not produced.");
      }

      const completed = await dependencies.completeVideo(
        event.videoId,
        claimToken,
        defaultOutput.fileName,
        outputs.map((output) => output.rendition),
      );
      if (!completed) {
        throw new Error("The processing claim expired before completion.");
      }
    } catch (error) {
      processingFailed = true;
      console.error("Video processing failed.", error);
      if (claimToken) {
        await dependencies
          .failVideo(event.videoId, claimToken)
          .catch((failure) => {
            console.error(
              "The failed video claim could not be updated.",
              failure,
            );
          });
      }
    } finally {
      if (claimToken) {
        const cleanupResults = await Promise.allSettled([
          dependencies.deleteRawVideo(event.inputFileName),
          ...event.outputFileNames.map((output) =>
            dependencies.deleteProcessedVideo(output.fileName),
          ),
        ]);
        if (cleanupResults.some((result) => result.status === "rejected")) {
          console.warn(
            "One or more temporary video files could not be removed.",
          );
        }
      }
    }

    if (processingFailed) {
      response.status(500).json({ error: "Video processing failed." });
      return;
    }

    response.status(204).send();
  });

  app.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      next: NextFunction,
    ) => {
      const errorType =
        typeof error === "object" && error !== null && "type" in error
          ? (error as { type?: unknown }).type
          : undefined;

      if (
        errorType === "entity.parse.failed" ||
        errorType === "entity.too.large"
      ) {
        console.warn("Rejected malformed Pub/Sub request body.");
        response.status(204).send();
        return;
      }

      next(error);
    },
  );

  return app;
}
