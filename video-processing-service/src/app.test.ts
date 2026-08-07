import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createProcessingApp, type ProcessingDependencies } from "./app";

const rawName = "user-1725000000000.mp4";

function pubsubRequest(name = rawName) {
  return {
    message: {
      data: Buffer.from(
        JSON.stringify({ bucket: "raw-videos", name }),
        "utf8",
      ).toString("base64"),
    },
  };
}

function dependencies(): ProcessingDependencies {
  return {
    rawVideoBucketName: "raw-videos",
    claimVideo: vi.fn().mockResolvedValue({
      status: "claimed",
      token: "claim-token",
    }),
    completeVideo: vi.fn().mockResolvedValue(true),
    failVideo: vi.fn().mockResolvedValue(undefined),
    downloadRawVideo: vi.fn().mockResolvedValue(undefined),
    convertVideo: vi.fn().mockResolvedValue(undefined),
    uploadProcessedVideo: vi.fn().mockResolvedValue(undefined),
    deleteRawVideo: vi.fn().mockResolvedValue(undefined),
    deleteProcessedVideo: vi.fn().mockResolvedValue(undefined),
  };
}

describe("createProcessingApp", () => {
  it("processes a claimed video and removes temporary files", async () => {
    const mocks = dependencies();
    const response = await request(createProcessingApp(mocks))
      .post("/process-video")
      .send(pubsubRequest());

    expect(response.status).toBe(204);
    expect(mocks.convertVideo).toHaveBeenCalledWith(
      rawName,
      "processed-user-1725000000000.mp4",
    );
    expect(mocks.completeVideo).toHaveBeenCalledOnce();
    expect(mocks.deleteRawVideo).toHaveBeenCalledOnce();
    expect(mocks.deleteProcessedVideo).toHaveBeenCalledOnce();
  });

  it("acknowledges a duplicate without downloading it", async () => {
    const mocks = dependencies();
    vi.mocked(mocks.claimVideo).mockResolvedValue({ status: "processed" });

    const response = await request(createProcessingApp(mocks))
      .post("/process-video")
      .send(pubsubRequest());

    expect(response.status).toBe(204);
    expect(mocks.downloadRawVideo).not.toHaveBeenCalled();
  });

  it("asks Pub/Sub to retry while another worker holds the lease", async () => {
    const mocks = dependencies();
    vi.mocked(mocks.claimVideo).mockResolvedValue({ status: "leased" });

    const response = await request(createProcessingApp(mocks))
      .post("/process-video")
      .send(pubsubRequest());

    expect(response.status).toBe(503);
    expect(response.headers["retry-after"]).toBe("30");
    expect(mocks.downloadRawVideo).not.toHaveBeenCalled();
  });

  it("rejects unsafe input before claiming it", async () => {
    const mocks = dependencies();
    const response = await request(createProcessingApp(mocks))
      .post("/process-video")
      .send(pubsubRequest("../video.mp4"));

    expect(response.status).toBe(204);
    expect(mocks.claimVideo).not.toHaveBeenCalled();
  });

  it("acknowledges invalid JSON and oversized poison messages", async () => {
    const mocks = dependencies();
    const app = createProcessingApp(mocks);

    const invalidJson = await request(app)
      .post("/process-video")
      .set("Content-Type", "application/json")
      .send("{");
    const oversized = await request(app)
      .post("/process-video")
      .send({ message: { data: "a".repeat(300 * 1024) } });

    expect(invalidJson.status).toBe(204);
    expect(oversized.status).toBe(204);
    expect(mocks.claimVideo).not.toHaveBeenCalled();
  });

  it("marks a failed claim and cleans up temporary files", async () => {
    const mocks = dependencies();
    vi.mocked(mocks.convertVideo).mockRejectedValue(new Error("ffmpeg error"));

    const response = await request(createProcessingApp(mocks))
      .post("/process-video")
      .send(pubsubRequest());

    expect(response.status).toBe(500);
    expect(mocks.failVideo).toHaveBeenCalledWith(
      "user-1725000000000",
      "claim-token",
    );
    expect(mocks.deleteRawVideo).toHaveBeenCalledOnce();
    expect(mocks.deleteProcessedVideo).toHaveBeenCalledOnce();
  });

  it("fails safely when claim ownership changes before completion", async () => {
    const mocks = dependencies();
    vi.mocked(mocks.completeVideo).mockResolvedValue(false);

    const response = await request(createProcessingApp(mocks))
      .post("/process-video")
      .send(pubsubRequest());

    expect(response.status).toBe(500);
    expect(mocks.failVideo).toHaveBeenCalledWith(
      "user-1725000000000",
      "claim-token",
    );
  });

  it("waits for temporary-file cleanup before acknowledging Pub/Sub", async () => {
    const mocks = dependencies();
    let finishCleanup: (() => void) | undefined;
    vi.mocked(mocks.deleteRawVideo).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishCleanup = resolve;
        }),
    );

    let responseResolved = false;
    const responsePromise = request(createProcessingApp(mocks))
      .post("/process-video")
      .send(pubsubRequest())
      .then((response) => {
        responseResolved = true;
        return response;
      });

    await vi.waitFor(() => {
      expect(mocks.deleteRawVideo).toHaveBeenCalledOnce();
    });
    expect(responseResolved).toBe(false);

    finishCleanup?.();
    expect((await responsePromise).status).toBe(204);
  });
});
