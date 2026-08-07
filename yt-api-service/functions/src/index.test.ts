import { Buffer } from "node:buffer";

import { maxUploadBytes } from "@yt/contract";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface StoredDocumentMock {
  data(): Record<string, unknown>;
  id: string;
}

const apiMocks = vi.hoisted(() => {
  let queryResults: StoredDocumentMock[][] = [];

  class MockTimestamp {
    constructor(private readonly milliseconds: number) {}

    static fromMillis(milliseconds: number) {
      return new MockTimestamp(milliseconds);
    }

    static now() {
      return new MockTimestamp(1_800_000_000_000);
    }

    toMillis() {
      return this.milliseconds;
    }
  }

  const documentSet = vi.fn().mockResolvedValue(undefined);
  const document = vi.fn(() => ({ set: documentSet }));
  const query = {
    get: vi.fn(() => Promise.resolve({ docs: queryResults.shift() ?? [] })),
    limit: vi.fn(),
    orderBy: vi.fn(),
    startAfter: vi.fn(),
    where: vi.fn(),
  };
  query.limit.mockImplementation(() => query);
  query.orderBy.mockImplementation(() => query);
  query.startAfter.mockImplementation(() => query);
  query.where.mockImplementation(() => query);
  const collectionReference = { ...query, doc: document };
  const collection = vi.fn(() => collectionReference);
  const generateSignedPostPolicyV4 = vi.fn().mockResolvedValue([
    {
      fields: { key: "signed-key" },
      url: "https://storage.example/upload",
    },
  ]);
  const storageFile = vi.fn(() => ({ generateSignedPostPolicyV4 }));
  const storageBucket = vi.fn(() => ({ file: storageFile }));
  const loggerInfo = vi.fn();

  return {
    MockTimestamp,
    collection,
    document,
    documentSet,
    generateSignedPostPolicyV4,
    loggerInfo,
    query,
    queueQueryResults(...results: StoredDocumentMock[][]) {
      queryResults.push(...results);
    },
    resetQueryResults() {
      queryResults = [];
    },
    storageBucket,
    storageFile,
  };
});

vi.mock("node:crypto", () => ({
  randomUUID: () => "123e4567-e89b-42d3-a456-426614174000",
}));
vi.mock("@google-cloud/storage", () => ({
  Storage: vi.fn(function Storage() {
    return { bucket: apiMocks.storageBucket };
  }),
}));
vi.mock("firebase-admin/app", () => ({
  getApps: vi.fn(() => [{}]),
  initializeApp: vi.fn(),
}));
vi.mock("firebase-admin/firestore", () => ({
  FieldPath: { documentId: vi.fn(() => "__name__") },
  Timestamp: apiMocks.MockTimestamp,
  getFirestore: vi.fn(() => ({ collection: apiMocks.collection })),
}));
vi.mock("firebase-functions/logger", () => ({ info: apiMocks.loggerInfo }));

import { createUser, generateUploadUrl, getVideos } from "./index";

type UploadRequest = Parameters<typeof generateUploadUrl.run>[0];
type VideoFeedRequest = Parameters<typeof getVideos.run>[0];

function uploadRequest(data: unknown, uid?: string): UploadRequest {
  return {
    auth: uid === undefined ? undefined : { uid, token: {} },
    data,
  } as UploadRequest;
}

function videoFeedRequest(data: unknown): VideoFeedRequest {
  return { data } as VideoFeedRequest;
}

function storedDocument(
  id: string,
  data: Record<string, unknown>,
): StoredDocumentMock {
  return { id, data: () => data };
}

function opaqueCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.resetQueryResults();
  apiMocks.generateSignedPostPolicyV4.mockResolvedValue([
    {
      fields: { key: "signed-key" },
      url: "https://storage.example/upload",
    },
  ]);
});

describe("generateUploadUrl", () => {
  it("rejects unauthenticated callers", async () => {
    await expect(
      generateUploadUrl.run(
        uploadRequest({ fileExtension: "mp4", fileSize: 100 }),
      ),
    ).rejects.toMatchObject({ code: "unauthenticated" });
    expect(apiMocks.generateSignedPostPolicyV4).not.toHaveBeenCalled();
  });

  it.each([
    [{ fileExtension: "exe", fileSize: 100 }, "extension"],
    [{ fileExtension: "mp4", fileSize: 0 }, "between 1 byte"],
    [{ fileExtension: "mp4", fileSize: "100" }, "between 1 byte"],
  ])("rejects invalid upload constraints", async (data, message) => {
    const result = generateUploadUrl.run(uploadRequest(data, "user-id"));
    await expect(result).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(result).rejects.toThrow(message);
  });

  it.each([
    [{ title: 42 }, "title must be a string"],
    [{ title: "x".repeat(101) }, "100 characters or fewer"],
    [{ title: "bad\u0000title" }, "control characters"],
    [{ description: 42 }, "description must be a string"],
    [{ description: "x".repeat(5_001) }, "5000 characters or fewer"],
    [{ description: "bad\ndescription" }, "control characters"],
  ])("validates optional title and description", async (metadata, message) => {
    const result = generateUploadUrl.run(
      uploadRequest(
        { fileExtension: "mp4", fileSize: 100, ...metadata },
        "user-id",
      ),
    );
    await expect(result).rejects.toMatchObject({ code: "invalid-argument" });
    await expect(result).rejects.toThrow(message);
  });

  it("creates a metadata document and an exact signed POST policy", async () => {
    const result = await generateUploadUrl.run(
      uploadRequest(
        {
          fileExtension: " MOV ",
          fileSize: 1_024,
          title: "  A title  ",
          description: "  A description  ",
        },
        "person/example",
      ),
    );
    const expectedVideoId = result.fileName.slice(0, -4);

    expect(result).toMatchObject({
      fields: { key: "signed-key" },
      maxUploadBytes,
      url: "https://storage.example/upload",
    });
    expect(result.fileName).toMatch(
      /^u~cGVyc29uL2V4YW1wbGU~\d{13}~[0-9a-f-]{36}\.mov$/,
    );
    expect(apiMocks.storageBucket).toHaveBeenCalledWith("redd-raw-videos");
    expect(apiMocks.storageFile).toHaveBeenCalledWith(result.fileName);
    expect(apiMocks.generateSignedPostPolicyV4).toHaveBeenCalledWith({
      expires: expect.any(Number),
      fields: { "Content-Type": "video/quicktime" },
      conditions: [
        ["content-length-range", 1, maxUploadBytes],
        ["eq", "$Content-Type", "video/quicktime"],
      ],
    });
    expect(apiMocks.document).toHaveBeenCalledWith(expectedVideoId);
    expect(apiMocks.documentSet).toHaveBeenCalledWith({
      id: expectedVideoId,
      uid: "person/example",
      title: "A title",
      description: "A description",
      status: "uploading",
      createdAt: expect.any(apiMocks.MockTimestamp),
      updatedAt: expect.any(apiMocks.MockTimestamp),
    });
  });

  it("omits absent optional metadata from Firestore", async () => {
    await generateUploadUrl.run(
      uploadRequest({ fileExtension: "mp4", fileSize: 1 }, "user-id"),
    );

    expect(apiMocks.documentSet).toHaveBeenCalledWith(
      expect.not.objectContaining({ title: expect.anything() }),
    );
    expect(apiMocks.documentSet).toHaveBeenCalledWith(
      expect.not.objectContaining({ description: expect.anything() }),
    );
  });
});

describe("getVideos", () => {
  it("paginates modern documents and then falls back to legacy documents", async () => {
    const first = storedDocument("video-c", {
      status: "processed",
      updatedAt: new apiMocks.MockTimestamp(300),
      filename: "processed-video-c-360p.mp4",
      uid: "private-user",
    });
    const second = storedDocument("video-b", {
      status: "processed",
      updatedAt: new apiMocks.MockTimestamp(200),
      title: "Second",
      claimToken: "private-token",
    });
    const third = storedDocument("video-a", {
      status: "processed",
      updatedAt: new apiMocks.MockTimestamp(100),
      description: "Third",
    });
    const legacy = storedDocument("legacy-video", {
      status: "processed",
      filename: "processed-legacy-video.mp4",
    });
    apiMocks.queueQueryResults([first, second, third]);

    const firstPage = await getVideos.run(videoFeedRequest({ limit: 2 }));

    expect(firstPage.videos).toEqual([
      { id: "video-c", filename: "processed-video-c-360p.mp4" },
      { id: "video-b", title: "Second" },
    ]);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(apiMocks.query.where).toHaveBeenCalledWith(
      "status",
      "==",
      "processed",
    );
    expect(apiMocks.query.orderBy).toHaveBeenCalledWith("updatedAt", "desc");
    expect(apiMocks.query.orderBy).toHaveBeenCalledWith("__name__", "desc");

    apiMocks.queueQueryResults([third], [legacy]);
    const secondPage = await getVideos.run(
      videoFeedRequest({ limit: 2, cursor: firstPage.nextCursor }),
    );

    expect(secondPage).toEqual({
      videos: [
        { id: "video-a", description: "Third" },
        { id: "legacy-video", filename: "processed-legacy-video.mp4" },
      ],
      nextCursor: null,
    });
    expect(apiMocks.query.startAfter).toHaveBeenCalledWith(
      expect.any(apiMocks.MockTimestamp),
      "video-b",
    );
  });

  it("uses a transition cursor when modern videos exactly fill the page", async () => {
    const modern = [
      storedDocument("modern-b", {
        status: "processed",
        updatedAt: new apiMocks.MockTimestamp(200),
      }),
      storedDocument("modern-a", {
        status: "processed",
        updatedAt: new apiMocks.MockTimestamp(100),
      }),
    ];
    const legacy = storedDocument("legacy-a", { status: "processed" });
    apiMocks.queueQueryResults(modern, [legacy]);

    const modernPage = await getVideos.run(videoFeedRequest({ limit: 2 }));
    expect(modernPage.videos).toHaveLength(2);
    expect(modernPage.nextCursor).toEqual(expect.any(String));

    apiMocks.queueQueryResults([legacy]);
    const legacyPage = await getVideos.run(
      videoFeedRequest({ limit: 2, cursor: modernPage.nextCursor }),
    );
    expect(legacyPage).toEqual({
      videos: [{ id: "legacy-a" }],
      nextCursor: null,
    });
  });

  it("returns null when no more videos exist and never leaks internal fields", async () => {
    apiMocks.queueQueryResults(
      [
        storedDocument("public-video", {
          status: "processed",
          uid: "private-user",
          claimToken: "private-token",
          claimedAt: "private-lease",
          renditions: ["360p", "unknown"],
          updatedAt: new apiMocks.MockTimestamp(100),
        }),
      ],
      [],
    );

    await expect(getVideos.run(videoFeedRequest({}))).resolves.toEqual({
      videos: [{ id: "public-video", renditions: ["360p"] }],
      nextCursor: null,
    });
    expect(apiMocks.query.limit).toHaveBeenCalledWith(13);
  });

  it("defensively excludes non-processed documents", async () => {
    apiMocks.queueQueryResults(
      [
        storedDocument("uploading-video", {
          status: "uploading",
          updatedAt: new apiMocks.MockTimestamp(100),
        }),
      ],
      [],
    );

    await expect(
      getVideos.run(videoFeedRequest({ limit: 5 })),
    ).resolves.toEqual({
      videos: [],
      nextCursor: null,
    });
  });

  it("clamps numeric limits and rejects non-numeric limits", async () => {
    apiMocks.queueQueryResults([], []);
    await getVideos.run(videoFeedRequest({ limit: -20 }));
    expect(apiMocks.query.limit).toHaveBeenCalledWith(2);

    apiMocks.queueQueryResults([], []);
    await getVideos.run(videoFeedRequest({ limit: 500 }));
    expect(apiMocks.query.limit).toHaveBeenCalledWith(51);

    await expect(
      getVideos.run(videoFeedRequest({ limit: "12" })),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it.each([
    "abc",
    "e30=",
    opaqueCursor({ phase: "unknown", version: 1 }),
    opaqueCursor({
      id: "video",
      phase: "updated",
      updatedAtMilliseconds: -1,
      version: 1,
    }),
    opaqueCursor({ afterId: "folder/video", phase: "legacy", version: 1 }),
    opaqueCursor({ afterId: null, extra: true, phase: "legacy", version: 1 }),
  ])("strictly rejects malformed cursor %s", async (cursor) => {
    await expect(
      getVideos.run(videoFeedRequest({ cursor })),
    ).rejects.toMatchObject({ code: "invalid-argument" });
  });

  it("scans past modern records while collecting legacy fallbacks", async () => {
    const modernBatch = Array.from({ length: 50 }, (_value, index) =>
      storedDocument(`modern-${index}`, {
        status: "processed",
        updatedAt: new apiMocks.MockTimestamp(index),
      }),
    );
    const legacy = storedDocument("legacy-only", { status: "processed" });
    apiMocks.queueQueryResults([], modernBatch, [legacy]);

    await expect(
      getVideos.run(videoFeedRequest({ limit: 1 })),
    ).resolves.toEqual({
      videos: [{ id: "legacy-only" }],
      nextCursor: null,
    });
    expect(apiMocks.query.startAfter).toHaveBeenCalledWith("modern-49");
  });

  it("fails safely if an ordered document has no Timestamp", async () => {
    apiMocks.queueQueryResults([
      storedDocument("invalid-time", {
        status: "processed",
        updatedAt: "not-a-timestamp",
      }),
      storedDocument("lookahead", {
        status: "processed",
        updatedAt: new apiMocks.MockTimestamp(1),
      }),
    ]);

    await expect(
      getVideos.run(videoFeedRequest({ limit: 1 })),
    ).rejects.toMatchObject({ code: "internal" });
  });
});

describe("createUser", () => {
  it("writes the admin-owned user record", async () => {
    const user = {
      uid: "user-id",
      email: undefined,
      photoURL: undefined,
    } as Parameters<typeof createUser.run>[0];

    await createUser.run(user, {});

    expect(apiMocks.collection).toHaveBeenCalledWith("users");
    expect(apiMocks.document).toHaveBeenCalledWith("user-id");
    expect(apiMocks.documentSet).toHaveBeenCalledWith({
      uid: "user-id",
      email: null,
      photoUrl: null,
    });
    expect(apiMocks.loggerInfo).toHaveBeenCalledWith("User record created.", {
      uid: "user-id",
    });
  });
});
