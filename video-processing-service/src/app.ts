import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import { defaultRenditionName, type RenditionName } from "@yt/contract";

import type {
  ProcessingAttempt,
  VideoClaimResult,
  VideoFailure,
} from "./claims";
import { parseVideoUploadRequest, type VideoOutputFile } from "./pubsub";
import { PermanentProcessingError } from "./storage";

const processingAttemptMilliseconds = 55 * 60 * 1000;

class ProcessingDeadlineError extends Error {
  override readonly name = "ProcessingDeadlineError";
}

class ClaimOwnershipError extends Error {
  override readonly name = "ClaimOwnershipError";
}

export interface ProcessingDependencies {
  rawVideoBucketName: string;
  claimVideo: (videoId: string, uid: string) => Promise<VideoClaimResult>;
  completeVideo: (
    videoId: string,
    claimToken: string,
    filename: string,
    renditions: RenditionName[],
  ) => Promise<boolean>;
  failVideo: (
    videoId: string,
    claimToken: string,
    failure: VideoFailure,
  ) => Promise<boolean>;
  ownsVideoClaim: (videoId: string, claimToken: string) => Promise<boolean>;
  downloadRawVideo: (
    fileName: string,
    attempt: ProcessingAttempt,
  ) => Promise<void>;
  convertVideo: (
    inputFileName: string,
    outputFileNames: readonly VideoOutputFile[],
    attempt: ProcessingAttempt,
  ) => Promise<VideoOutputFile[]>;
  uploadProcessedVideo: (
    fileName: string,
    attempt: ProcessingAttempt,
  ) => Promise<void>;
  deletePublishedVideo: (
    fileName: string,
    attempt: ProcessingAttempt,
  ) => Promise<void>;
  deleteRawVideo: (
    fileName: string,
    attempt: ProcessingAttempt,
  ) => Promise<void>;
  deleteProcessedVideo: (
    fileName: string,
    attempt: ProcessingAttempt,
  ) => Promise<void>;
}

function withinDeadline<T>(
  operation: () => Promise<T>,
  attempt: ProcessingAttempt,
): Promise<T> {
  const remaining = attempt.deadlineMilliseconds - Date.now();
  if (remaining <= 0) {
    return Promise.reject(
      new ProcessingDeadlineError("The video processing attempt timed out."),
    );
  }

  let operationPromise: Promise<T>;
  try {
    operationPromise = operation();
  } catch (error) {
    return Promise.reject(
      error instanceof Error
        ? error
        : new Error("A processing operation threw without an Error."),
    );
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new ProcessingDeadlineError("The video processing attempt timed out."),
      );
    }, remaining);
    void operationPromise.then(
      (value) => {
        clearTimeout(timer);
        if (Date.now() >= attempt.deadlineMilliseconds) {
          reject(
            new ProcessingDeadlineError(
              "The video processing attempt timed out.",
            ),
          );
        } else {
          resolve(value);
        }
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(
          error instanceof Error
            ? error
            : new Error("A processing operation rejected without an Error."),
        );
      },
    );
  });
}

function failureDetails(error: unknown): VideoFailure {
  if (error instanceof PermanentProcessingError) {
    return { permanent: true, reason: error.message };
  }

  return {
    permanent: false,
    reason: "A transient video processing failure occurred.",
  };
}

async function requireClaimOwnership(
  dependencies: ProcessingDependencies,
  videoId: string,
  attempt: ProcessingAttempt,
): Promise<void> {
  const ownsClaim = await withinDeadline(
    () => dependencies.ownsVideoClaim(videoId, attempt.claimToken),
    attempt,
  );
  if (!ownsClaim) {
    throw new ClaimOwnershipError(
      "The processing claim is no longer owned by this worker.",
    );
  }
}

async function cleanupTemporaryFiles(
  dependencies: ProcessingDependencies,
  inputFileName: string,
  outputFileNames: readonly VideoOutputFile[],
  attempt: ProcessingAttempt,
): Promise<void> {
  const cleanupResults = await Promise.allSettled([
    withinDeadline(
      () => dependencies.deleteRawVideo(inputFileName, attempt),
      attempt,
    ),
    ...outputFileNames.map((output) =>
      withinDeadline(
        () => dependencies.deleteProcessedVideo(output.fileName, attempt),
        attempt,
      ),
    ),
  ]);
  const deadlineFailure = cleanupResults.find(
    (result) =>
      result.status === "rejected" &&
      result.reason instanceof ProcessingDeadlineError,
  );
  if (deadlineFailure?.status === "rejected") {
    throw deadlineFailure.reason;
  }
  if (cleanupResults.some((result) => result.status === "rejected")) {
    console.warn("One or more temporary video files could not be removed.");
  }
}

async function cleanupPublishedVideos(
  dependencies: ProcessingDependencies,
  fileNames: readonly string[],
  attempt: ProcessingAttempt,
): Promise<void> {
  const cleanupResults = await Promise.allSettled(
    fileNames.map((fileName) =>
      withinDeadline(
        () => dependencies.deletePublishedVideo(fileName, attempt),
        attempt,
      ),
    ),
  );
  const deadlineFailure = cleanupResults.find(
    (result) =>
      result.status === "rejected" &&
      result.reason instanceof ProcessingDeadlineError,
  );
  if (deadlineFailure?.status === "rejected") {
    throw deadlineFailure.reason;
  }
  if (cleanupResults.some((result) => result.status === "rejected")) {
    console.warn(
      "One or more incomplete processed uploads could not be removed.",
    );
  }
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

    let attempt: ProcessingAttempt | null = null;
    let processingFailed = false;
    let permanentFailureRecorded = false;
    let uploadedFileNames: string[] = [];
    try {
      const claim = await dependencies.claimVideo(event.videoId, event.uid);
      if (
        claim.status === "processed" ||
        claim.status === "permanent-failure"
      ) {
        response.status(204).send();
        return;
      }
      if (claim.status === "leased") {
        response.set("Retry-After", "30").status(503).json({
          error: "Video processing is already in progress.",
        });
        return;
      }
      attempt = {
        claimToken: claim.token,
        deadlineMilliseconds: Date.now() + processingAttemptMilliseconds,
      };
      const currentAttempt = attempt;

      await withinDeadline(
        () =>
          dependencies.downloadRawVideo(event.inputFileName, currentAttempt),
        currentAttempt,
      );
      const outputs = await withinDeadline(
        () =>
          dependencies.convertVideo(
            event.inputFileName,
            event.outputFileNames,
            currentAttempt,
          ),
        currentAttempt,
      );
      await requireClaimOwnership(dependencies, event.videoId, currentAttempt);
      const uploadResults = await Promise.allSettled(
        outputs.map((output) =>
          withinDeadline(
            () =>
              dependencies.uploadProcessedVideo(
                output.fileName,
                currentAttempt,
              ),
            currentAttempt,
          ),
        ),
      );
      uploadedFileNames = outputs.flatMap((output, index) =>
        uploadResults[index]?.status === "fulfilled" ? [output.fileName] : [],
      );
      const uploadFailure = uploadResults.find(
        (result) => result.status === "rejected",
      );
      if (uploadFailure?.status === "rejected") {
        throw uploadFailure.reason;
      }
      const defaultOutput = outputs.find(
        (output) => output.rendition === defaultRenditionName,
      );
      if (!defaultOutput) {
        throw new Error("The default video rendition was not produced.");
      }

      await requireClaimOwnership(dependencies, event.videoId, currentAttempt);
      await cleanupTemporaryFiles(
        dependencies,
        event.inputFileName,
        event.outputFileNames,
        currentAttempt,
      );
      const completed = await withinDeadline(
        () =>
          dependencies.completeVideo(
            event.videoId,
            currentAttempt.claimToken,
            defaultOutput.fileName,
            outputs.map((output) => output.rendition),
          ),
        currentAttempt,
      );
      if (!completed) {
        throw new Error("The processing claim expired before completion.");
      }
    } catch (error) {
      processingFailed = true;
      console.error("Video processing failed.", error);
      if (attempt && !(error instanceof ProcessingDeadlineError)) {
        const failedAttempt = attempt;
        try {
          await requireClaimOwnership(
            dependencies,
            event.videoId,
            failedAttempt,
          );
          if (uploadedFileNames.length > 0) {
            await cleanupPublishedVideos(
              dependencies,
              uploadedFileNames,
              failedAttempt,
            );
          }
          await cleanupTemporaryFiles(
            dependencies,
            event.inputFileName,
            event.outputFileNames,
            failedAttempt,
          );
          const failure = failureDetails(error);
          const recorded = await withinDeadline(
            () =>
              dependencies.failVideo(
                event.videoId,
                failedAttempt.claimToken,
                failure,
              ),
            failedAttempt,
          );
          permanentFailureRecorded = failure.permanent && recorded;
        } catch (failure) {
          console.error(
            "The failed video claim could not be safely finalized.",
            failure,
          );
        }
      }
    }

    if (processingFailed) {
      if (permanentFailureRecorded) {
        response.status(204).send();
        return;
      }
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
