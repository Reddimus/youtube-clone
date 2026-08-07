import { IncomingMessage, ServerResponse } from "node:http";
import type { Socket } from "node:net";
import { Duplex } from "node:stream";

import type { Express } from "express";
import { describe, expect, it, vi } from "vitest";

import { createProcessingApp, type ProcessingDependencies } from "./app";
import type { VideoOutputFile } from "./pubsub";

const rawName = "user-1725000000000.mp4";
const outputFileNames: VideoOutputFile[] = [
  {
    fileName: "processed-user-1725000000000-360p.mp4",
    rendition: "360p",
  },
  {
    fileName: "processed-user-1725000000000-720p.mp4",
    rendition: "720p",
  },
];

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

interface AppResponse {
  body: string;
  headers: ReturnType<ServerResponse["getHeaders"]>;
  status: number;
}

class MemorySocket extends Duplex {
  readonly chunks: Buffer[] = [];

  override destroy(error?: Error): this {
    if (error) {
      this.emit("error", error);
    }
    return this;
  }

  override _read(): void {}

  override _write(
    chunk: unknown,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)),
    );
    callback();
  }
}

function send(
  app: Express,
  method: "GET" | "POST",
  route: string,
  body?: unknown,
  rawBody?: string,
): Promise<AppResponse> {
  const socket = new MemorySocket();
  const request = new IncomingMessage(socket as unknown as Socket);
  request.method = method;
  request.url = route;
  const serializedBody =
    rawBody ?? (body === undefined ? "" : JSON.stringify(body));
  if (serializedBody.length > 0) {
    request.headers = {
      "content-length": String(Buffer.byteLength(serializedBody)),
      "content-type": "application/json",
    };
  }

  const response = new ServerResponse(request);
  response.assignSocket(socket as unknown as Socket);

  return new Promise((resolve, reject) => {
    response.once("finish", () => {
      const wireResponse = Buffer.concat(socket.chunks).toString("utf8");
      resolve({
        body: wireResponse.split("\r\n\r\n", 2)[1] ?? "",
        headers: response.getHeaders(),
        status: response.statusCode,
      });
    });
    response.once("error", reject);
    app(request, response);
    request.push(serializedBody);
    request.push(null);
  });
}

function post(app: Express, body: unknown): Promise<AppResponse> {
  return send(app, "POST", "/process-video", body);
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
    convertVideo: vi.fn().mockResolvedValue(outputFileNames),
    uploadProcessedVideo: vi.fn().mockResolvedValue(undefined),
    deleteRawVideo: vi.fn().mockResolvedValue(undefined),
    deleteProcessedVideo: vi.fn().mockResolvedValue(undefined),
  };
}

describe("createProcessingApp", () => {
  it("processes every produced rendition and removes temporary files", async () => {
    const mocks = dependencies();
    const response = await post(createProcessingApp(mocks), pubsubRequest());

    expect(response.status).toBe(204);
    expect(mocks.convertVideo).toHaveBeenCalledWith(rawName, outputFileNames);
    expect(mocks.uploadProcessedVideo).toHaveBeenCalledTimes(2);
    expect(mocks.uploadProcessedVideo).toHaveBeenNthCalledWith(
      1,
      outputFileNames[0].fileName,
    );
    expect(mocks.uploadProcessedVideo).toHaveBeenNthCalledWith(
      2,
      outputFileNames[1].fileName,
    );
    expect(mocks.completeVideo).toHaveBeenCalledWith(
      "user-1725000000000",
      "claim-token",
      outputFileNames[0].fileName,
      ["360p", "720p"],
    );
    expect(mocks.deleteRawVideo).toHaveBeenCalledOnce();
    expect(mocks.deleteProcessedVideo).toHaveBeenCalledTimes(2);
  });

  it("acknowledges a duplicate without downloading it", async () => {
    const mocks = dependencies();
    vi.mocked(mocks.claimVideo).mockResolvedValue({ status: "processed" });

    const response = await post(createProcessingApp(mocks), pubsubRequest());

    expect(response.status).toBe(204);
    expect(mocks.downloadRawVideo).not.toHaveBeenCalled();
  });

  it("asks Pub/Sub to retry while another worker holds the lease", async () => {
    const mocks = dependencies();
    vi.mocked(mocks.claimVideo).mockResolvedValue({ status: "leased" });

    const response = await post(createProcessingApp(mocks), pubsubRequest());

    expect(response.status).toBe(503);
    expect(response.headers["retry-after"]).toBe("30");
    expect(mocks.downloadRawVideo).not.toHaveBeenCalled();
  });

  it("rejects unsafe input before claiming it", async () => {
    const mocks = dependencies();
    const response = await post(
      createProcessingApp(mocks),
      pubsubRequest("../video.mp4"),
    );

    expect(response.status).toBe(204);
    expect(mocks.claimVideo).not.toHaveBeenCalled();
  });

  it("acknowledges invalid JSON and oversized poison messages", async () => {
    const mocks = dependencies();
    const app = createProcessingApp(mocks);

    const invalidJson = await send(
      app,
      "POST",
      "/process-video",
      undefined,
      "{",
    );
    const oversized = await post(app, {
      message: { data: "a".repeat(300 * 1024) },
    });

    expect(invalidJson.status).toBe(204);
    expect(oversized.status).toBe(204);
    expect(mocks.claimVideo).not.toHaveBeenCalled();
  });

  it("marks a failed claim and cleans up every candidate file", async () => {
    const mocks = dependencies();
    vi.mocked(mocks.convertVideo).mockRejectedValue(new Error("ffmpeg error"));

    const response = await post(createProcessingApp(mocks), pubsubRequest());

    expect(response.status).toBe(500);
    expect(mocks.failVideo).toHaveBeenCalledWith(
      "user-1725000000000",
      "claim-token",
    );
    expect(mocks.deleteRawVideo).toHaveBeenCalledOnce();
    expect(mocks.deleteProcessedVideo).toHaveBeenCalledTimes(2);
  });

  it("fails safely when claim ownership changes before completion", async () => {
    const mocks = dependencies();
    vi.mocked(mocks.completeVideo).mockResolvedValue(false);

    const response = await post(createProcessingApp(mocks), pubsubRequest());

    expect(response.status).toBe(500);
    expect(mocks.failVideo).toHaveBeenCalledWith(
      "user-1725000000000",
      "claim-token",
    );
  });

  it("fails when conversion omits the default rendition", async () => {
    const mocks = dependencies();
    vi.mocked(mocks.convertVideo).mockResolvedValue([outputFileNames[1]]);

    const response = await post(createProcessingApp(mocks), pubsubRequest());

    expect(response.status).toBe(500);
    expect(mocks.completeVideo).not.toHaveBeenCalled();
    expect(mocks.failVideo).toHaveBeenCalledOnce();
  });

  it("continues after claim-failure and cleanup rejections", async () => {
    const mocks = dependencies();
    vi.mocked(mocks.convertVideo).mockRejectedValue(new Error("ffmpeg error"));
    vi.mocked(mocks.failVideo).mockRejectedValue(new Error("firestore error"));
    vi.mocked(mocks.deleteProcessedVideo).mockRejectedValue(
      new Error("rm error"),
    );

    const response = await post(createProcessingApp(mocks), pubsubRequest());

    expect(response.status).toBe(500);
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
    const responsePromise = post(
      createProcessingApp(mocks),
      pubsubRequest(),
    ).then((response) => {
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

  it("reports healthy without exposing Express", async () => {
    const response = await send(
      createProcessingApp(dependencies()),
      "GET",
      "/healthz",
    );

    expect(response.status).toBe(200);
    expect(response.body).toBe('{"status":"ok"}');
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });
});
