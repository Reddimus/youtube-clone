import { beforeEach, describe, expect, it, vi } from "vitest";

const callable = vi.fn();

vi.mock("./firebase", () => ({
  getFirebaseFunctions: vi.fn().mockResolvedValue({}),
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: () => callable,
}));

const { uploadVideo } = await import("./functions");

const videoId =
  "u~dWlkLTEyMw~1717171717171~0f9d2f2f-6a3a-4b1e-9c2e-2f1a5b6c7d8e";

/** Minimal XMLHttpRequest double: fetch cannot report upload progress. */
class FakeXhr {
  static instances: FakeXhr[] = [];
  static status = 204;
  static failWith: "error" | null = null;

  status = 0;
  upload = {
    listeners: {} as Record<string, (event: unknown) => void>,
    addEventListener(type: string, fn: (event: unknown) => void) {
      this.listeners[type] = fn;
    },
  };
  private listeners: Record<string, () => void> = {};

  constructor() {
    FakeXhr.instances.push(this);
  }

  open() {}

  addEventListener(type: string, fn: () => void) {
    this.listeners[type] = fn;
  }

  send() {
    queueMicrotask(() => {
      if (FakeXhr.failWith) {
        this.listeners[FakeXhr.failWith]?.();
        return;
      }
      this.upload.listeners.progress?.({
        lengthComputable: true,
        loaded: 50,
        total: 100,
      });
      this.status = FakeXhr.status;
      this.listeners.load?.();
    });
  }

  abort() {
    this.listeners.abort?.();
  }
}

function makeFile(name = "clip.mp4", size = 1_024): File {
  const file = new File(["x"], name, { type: "video/mp4" });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

beforeEach(() => {
  FakeXhr.instances = [];
  FakeXhr.status = 204;
  FakeXhr.failWith = null;
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  callable.mockResolvedValue({
    data: {
      url: "https://storage.googleapis.com/redd-raw-videos",
      fields: { key: `${videoId}.mp4`, policy: "abc" },
      fileName: `${videoId}.mp4`,
      maxUploadBytes: 250 * 1024 * 1024,
    },
  });
});

describe("uploadVideo", () => {
  it("requests a policy, uploads, and returns the derived video ID", async () => {
    const onProgress = vi.fn();
    const result = await uploadVideo(
      makeFile(),
      { title: "  Holiday  ", description: "  A clip  " },
      { onProgress },
    );

    expect(callable).toHaveBeenCalledWith({
      fileExtension: "mp4",
      fileSize: 1_024,
      title: "Holiday",
      description: "A clip",
    });
    expect(result).toEqual({ videoId, fileName: `${videoId}.mp4` });
    expect(onProgress).toHaveBeenCalledWith(0.5);
    expect(onProgress).toHaveBeenLastCalledWith(1);
  });

  it("omits blank title and description rather than sending empty strings", async () => {
    await uploadVideo(makeFile(), { title: "   ", description: "" });
    expect(callable).toHaveBeenCalledWith({
      fileExtension: "mp4",
      fileSize: 1_024,
    });
  });

  it("rejects an over-long title before contacting the server", async () => {
    await expect(
      uploadVideo(makeFile(), { title: "a".repeat(101) }),
    ).rejects.toThrow("Keep this under 100 characters.");
    expect(callable).not.toHaveBeenCalled();
  });

  it.each([
    ["clip.avi", 1_024, "Choose an MP4, MOV, WebM, or M4V video file."],
    ["clip.mp4", 0, "Choose a non-empty video no larger than 250 MiB."],
    [
      "clip.mp4",
      250 * 1024 * 1024 + 1,
      "Choose a non-empty video no larger than 250 MiB.",
    ],
  ])(
    "rejects %j at %j bytes without calling the API",
    async (name, size, message) => {
      await expect(uploadVideo(makeFile(name, size))).rejects.toThrow(message);
      expect(callable).not.toHaveBeenCalled();
    },
  );

  it("refuses when the server advertises a smaller limit than the file", async () => {
    callable.mockResolvedValue({
      data: {
        url: "https://storage.googleapis.com/redd-raw-videos",
        fields: {},
        fileName: `${videoId}.mp4`,
        maxUploadBytes: 10,
      },
    });

    await expect(uploadVideo(makeFile())).rejects.toThrow(
      "The video exceeds the server upload limit.",
    );
  });

  it("surfaces a non-2xx upload as an error", async () => {
    FakeXhr.status = 403;
    await expect(uploadVideo(makeFile())).rejects.toThrow(
      "Video upload failed with status 403.",
    );
  });

  it("surfaces a dropped connection", async () => {
    FakeXhr.failWith = "error";
    await expect(uploadVideo(makeFile())).rejects.toThrow(
      "The network dropped while uploading the video.",
    );
  });

  it("aborts when the caller cancels", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      uploadVideo(makeFile(), {}, { signal: controller.signal }),
    ).rejects.toThrow("Upload cancelled.");
  });
});
