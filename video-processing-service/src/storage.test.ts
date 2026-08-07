import path from "node:path";

import { maxUploadBytes } from "@yt/contract";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { VideoOutputFile } from "./pubsub";
import type { ProcessingAttempt } from "./claims";
import {
  createVideoStorage,
  PermanentProcessingError,
  validateRawVideoSize,
} from "./storage";

type ExecCallback = (
  error: Error | null,
  stdout: string,
  stderr: string,
) => void;
type ExecFileCall = (
  command: string,
  argumentsList: readonly string[],
  options: unknown,
  callback: ExecCallback,
) => unknown;

const processMocks = vi.hoisted(() => ({
  execFile: vi.fn<ExecFileCall>(),
}));
const fileSystemMocks = vi.hoisted(() => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
}));
const storageMocks = vi.hoisted(() => ({
  bucket: vi.fn(),
  deleteObject: vi.fn().mockResolvedValue(undefined),
  download: vi.fn().mockResolvedValue(undefined),
  file: vi.fn(),
  getMetadata: vi.fn().mockResolvedValue([{ size: "100" }]),
  makePublic: vi.fn().mockResolvedValue(undefined),
  upload: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("node:child_process", () => ({ execFile: processMocks.execFile }));
vi.mock("node:fs/promises", () => ({
  mkdir: fileSystemMocks.mkdir,
  rm: fileSystemMocks.rm,
}));
vi.mock("@google-cloud/storage", () => ({
  Storage: vi.fn(function Storage() {
    return { bucket: storageMocks.bucket };
  }),
}));

const outputs: VideoOutputFile[] = [
  { fileName: "processed-user-1725000000000-360p.mp4", rendition: "360p" },
  { fileName: "processed-user-1725000000000-720p.mp4", rendition: "720p" },
];
const attempt: ProcessingAttempt = {
  claimToken: "claim-token",
  deadlineMilliseconds: Number.MAX_SAFE_INTEGER,
};

function storage() {
  return createVideoStorage({
    processedVideoBucketName: "processed-bucket",
    rawVideoBucketName: "raw-bucket",
    workDir: "/work",
  });
}

function mockProcesses(
  height: number,
  ffmpegError: Error | null = null,
  width = 1_920,
  rotation?: number,
) {
  processMocks.execFile.mockImplementation(
    (command, _argumentsList, _options, callback) => {
      if (command === "ffprobe") {
        callback(
          null,
          JSON.stringify({
            streams: [
              {
                height,
                width,
                ...(rotation === undefined
                  ? {}
                  : { side_data_list: [{ rotation }] }),
              },
            ],
          }),
          "",
        );
      } else {
        callback(ffmpegError, "", "");
      }
      return undefined;
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  storageMocks.file.mockReturnValue({
    download: storageMocks.download,
    getMetadata: storageMocks.getMetadata,
    makePublic: storageMocks.makePublic,
    delete: storageMocks.deleteObject,
  });
  storageMocks.bucket.mockReturnValue({
    file: storageMocks.file,
    upload: storageMocks.upload,
  });
  storageMocks.getMetadata.mockResolvedValue([{ size: "100" }]);
  mockProcesses(1_080);
});

describe("validateRawVideoSize", () => {
  it("accepts numeric storage metadata up to the configured maximum", () => {
    expect(validateRawVideoSize(String(maxUploadBytes))).toBe(maxUploadBytes);
  });

  it.each([undefined, "", "not-a-number", 0, -1, maxUploadBytes + 1, 1.5])(
    "rejects invalid object size %s",
    (size) => {
      expect(() => validateRawVideoSize(size)).toThrow();
    },
  );
});

describe("createVideoStorage", () => {
  it("creates both working directories", async () => {
    await storage().setupDirectories();

    expect(fileSystemMocks.mkdir).toHaveBeenCalledWith("/work/raw-videos", {
      recursive: true,
    });
    expect(fileSystemMocks.mkdir).toHaveBeenCalledWith(
      "/work/processed-videos",
      { recursive: true },
    );
  });

  it("checks object size before downloading from the configured raw bucket", async () => {
    await storage().downloadRawVideo("user-1725000000000.mp4", attempt);

    expect(storageMocks.bucket).toHaveBeenCalledWith("raw-bucket");
    expect(storageMocks.getMetadata).toHaveBeenCalledOnce();
    expect(storageMocks.download).toHaveBeenCalledWith({
      destination: "/work/raw-videos/claim-token/user-1725000000000.mp4",
    });

    storageMocks.getMetadata.mockResolvedValueOnce([
      { size: String(maxUploadBytes + 1) },
    ]);
    await expect(
      storage().downloadRawVideo("user-1725000000000.mp4", attempt),
    ).rejects.toThrow("size limit");
    expect(storageMocks.download).toHaveBeenCalledOnce();
  });

  it("probes once and transcodes 360p and 720p in one ffmpeg call", async () => {
    await expect(
      storage().convertVideo("user-1725000000000.mp4", outputs, attempt),
    ).resolves.toEqual(outputs);

    expect(processMocks.execFile).toHaveBeenCalledTimes(2);
    expect(processMocks.execFile.mock.calls[0][0]).toBe("ffprobe");
    const [command, argumentsList, options] =
      processMocks.execFile.mock.calls[1];
    expect(command).toBe("ffmpeg");
    expect(argumentsList).toEqual(
      expect.arrayContaining([
        "-filter_complex",
        "-map",
        "0:a?",
        "-pix_fmt",
        "yuv420p",
        "800k",
        "1600k",
        "2500k",
        "5000k",
        path.join("/work/processed-videos/claim-token", outputs[0].fileName),
        path.join("/work/processed-videos/claim-token", outputs[1].fileName),
      ]),
    );
    expect(argumentsList.join(" ")).toContain("split=2");
    expect(options).toMatchObject({
      killSignal: "SIGKILL",
      maxBuffer: 10 * 1024 * 1024,
      timeout: 55 * 60 * 1000,
    });
  });

  it("emits only 360p for a 480p source and never upscales a short source", async () => {
    mockProcesses(480);
    await expect(
      storage().convertVideo("user-1725000000000.mp4", outputs, attempt),
    ).resolves.toEqual([outputs[0]]);
    expect(processMocks.execFile.mock.calls[1][1].join(" ")).not.toContain(
      outputs[1].fileName,
    );

    vi.clearAllMocks();
    mockProcesses(240);
    await expect(
      storage().convertVideo("user-1725000000000.mp4", outputs, attempt),
    ).resolves.toEqual([outputs[0]]);
    expect(processMocks.execFile.mock.calls[1][1].join(" ")).toContain(
      "min(360\\,ih)",
    );
  });

  it("selects renditions from display-matrix-rotated dimensions", async () => {
    mockProcesses(1_280, null, 360, -90);

    await expect(
      storage().convertVideo("user-1725000000000.mp4", outputs, attempt),
    ).resolves.toEqual([outputs[0]]);
    expect(processMocks.execFile.mock.calls[1][1].join(" ")).not.toContain(
      outputs[1].fileName,
    );
  });

  it("reports ffprobe, invalid-height, ffmpeg, and missing-output failures", async () => {
    processMocks.execFile.mockImplementationOnce(
      (_command, _argumentsList, _options, callback) => {
        callback(new Error("probe"), "", "");
        return undefined;
      },
    );
    await expect(
      storage().convertVideo("user-1725000000000.mp4", outputs, attempt),
    ).rejects.toThrow("FFprobe failed");

    processMocks.execFile.mockImplementationOnce(
      (_command, _argumentsList, _options, callback) => {
        callback(null, '{"streams":[]}', "");
        return undefined;
      },
    );
    await expect(
      storage().convertVideo("user-1725000000000.mp4", outputs, attempt),
    ).rejects.toBeInstanceOf(PermanentProcessingError);

    mockProcesses(1_080, new Error("encode"));
    await expect(
      storage().convertVideo("user-1725000000000.mp4", outputs, attempt),
    ).rejects.toThrow("FFmpeg failed");

    mockProcesses(1_080);
    await expect(
      storage().convertVideo("user-1725000000000.mp4", [outputs[0]], attempt),
    ).rejects.toThrow("720p");
    await expect(
      storage().convertVideo("user-1725000000000.mp4", [], attempt),
    ).rejects.toThrow("smallest rendition");
  });

  it("classifies media rejection as permanent and process timeout as transient", async () => {
    const rejectedInput = Object.assign(new Error("invalid input"), {
      code: 1,
    });
    mockProcesses(1_080, rejectedInput);
    await expect(
      storage().convertVideo("user-1725000000000.mp4", outputs, attempt),
    ).rejects.toBeInstanceOf(PermanentProcessingError);

    const timeout = Object.assign(new Error("timeout"), { killed: true });
    mockProcesses(1_080, timeout);
    await expect(
      storage().convertVideo("user-1725000000000.mp4", outputs, attempt),
    ).rejects.not.toBeInstanceOf(PermanentProcessingError);
  });

  it("uploads to the configured processed bucket and makes the object public", async () => {
    await storage().uploadProcessedVideo(outputs[0].fileName, attempt);

    expect(storageMocks.bucket).toHaveBeenCalledWith("processed-bucket");
    expect(storageMocks.upload).toHaveBeenCalledWith(
      `/work/processed-videos/claim-token/${outputs[0].fileName}`,
      {
        destination: outputs[0].fileName,
        metadata: { contentType: "video/mp4" },
        timeout: 4 * 60 * 1_000,
      },
    );
    expect(storageMocks.makePublic).toHaveBeenCalledOnce();
  });

  it("removes an uploaded object when making it public fails", async () => {
    storageMocks.makePublic.mockRejectedValueOnce(new Error("acl"));

    await expect(
      storage().uploadProcessedVideo(outputs[0].fileName, attempt),
    ).rejects.toThrow("acl");
    expect(storageMocks.deleteObject).toHaveBeenCalledWith({
      ignoreNotFound: true,
    });
  });

  it("deletes incomplete published renditions", async () => {
    await storage().deletePublishedVideo(outputs[0].fileName, attempt);

    expect(storageMocks.bucket).toHaveBeenCalledWith("processed-bucket");
    expect(storageMocks.file).toHaveBeenCalledWith(outputs[0].fileName);
    expect(storageMocks.deleteObject).toHaveBeenCalledWith({
      ignoreNotFound: true,
    });

    await expect(
      storage().deletePublishedVideo("../video.mp4", attempt),
    ).rejects.toBeInstanceOf(PermanentProcessingError);
  });

  it("guards every local path and deletes safe temporary files", async () => {
    await expect(
      storage().downloadRawVideo("../video.mp4", attempt),
    ).rejects.toThrow("unusable");
    await expect(
      storage().uploadProcessedVideo("folder/video.mp4", attempt),
    ).rejects.toThrow("unusable");
    await expect(
      storage().convertVideo("../video.mp4", outputs, attempt),
    ).rejects.toThrow("unusable");
    expect(() => storage().deleteRawVideo("../video.mp4", attempt)).toThrow(
      "unusable",
    );
    expect(() => storage().deleteProcessedVideo("video.exe", attempt)).toThrow(
      "unusable",
    );

    await storage().deleteRawVideo("user-1725000000000.mp4", attempt);
    await storage().deleteProcessedVideo(outputs[0].fileName, attempt);
    expect(fileSystemMocks.rm).toHaveBeenCalledTimes(2);
    expect(fileSystemMocks.rm).toHaveBeenCalledWith(
      `/work/processed-videos/claim-token/${outputs[0].fileName}`,
      { force: true },
    );
  });
});
