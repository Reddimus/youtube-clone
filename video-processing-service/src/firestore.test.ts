import { beforeEach, describe, expect, it, vi } from "vitest";

interface TransactionMock {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
}

const firebaseMocks = vi.hoisted(() => {
  let snapshotData: Record<string, unknown> | undefined;
  let nowMilliseconds = 1_800_000_000_000;

  class MockTimestamp {
    constructor(private readonly milliseconds: number) {}

    static now() {
      return new MockTimestamp(nowMilliseconds);
    }

    toMillis() {
      return this.milliseconds;
    }
  }

  const videoReference = { path: "videos/video" };
  const transaction: TransactionMock = {
    get: vi.fn(() => Promise.resolve({ data: () => snapshotData })),
    set: vi.fn(),
  };
  const runTransaction = vi.fn(
    async (callback: (value: TransactionMock) => Promise<unknown>) =>
      callback(transaction),
  );
  const doc = vi.fn(() => videoReference);
  const collection = vi.fn(() => ({ doc }));
  const deleteField = { operation: "delete" };
  const fieldDelete = vi.fn(() => deleteField);

  return {
    MockTimestamp,
    collection,
    deleteField,
    doc,
    fieldDelete,
    runTransaction,
    setNow(milliseconds: number) {
      nowMilliseconds = milliseconds;
    },
    setSnapshot(data: Record<string, unknown> | undefined) {
      snapshotData = data;
    },
    transaction,
    videoReference,
  };
});

vi.mock("node:crypto", () => ({ randomUUID: () => "claim-token" }));
vi.mock("firebase-admin/app", () => ({
  applicationDefault: vi.fn(() => "credential"),
  getApps: vi.fn(() => [{}]),
  initializeApp: vi.fn(),
}));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { delete: firebaseMocks.fieldDelete },
  Timestamp: firebaseMocks.MockTimestamp,
  getFirestore: vi.fn(() => ({
    collection: firebaseMocks.collection,
    runTransaction: firebaseMocks.runTransaction,
  })),
}));

import { claimVideo, completeVideo, failVideo } from "./firestore";

beforeEach(() => {
  vi.clearAllMocks();
  firebaseMocks.setNow(1_800_000_000_000);
  firebaseMocks.setSnapshot(undefined);
});

describe("claimVideo", () => {
  it("claims a fresh video with a merge that preserves upload metadata", async () => {
    firebaseMocks.setSnapshot({ status: "uploading", title: "Keep me" });

    await expect(claimVideo("video-id", "user-id")).resolves.toEqual({
      status: "claimed",
      token: "claim-token",
    });
    expect(firebaseMocks.transaction.set).toHaveBeenCalledWith(
      firebaseMocks.videoReference,
      {
        id: "video-id",
        uid: "user-id",
        status: "processing",
        claimToken: "claim-token",
        claimedAt: expect.any(firebaseMocks.MockTimestamp),
        updatedAt: expect.any(firebaseMocks.MockTimestamp),
      },
      { merge: true },
    );
  });

  it("short-circuits a video that is already processed", async () => {
    firebaseMocks.setSnapshot({ status: "processed" });

    await expect(claimVideo("video-id", "user-id")).resolves.toEqual({
      status: "processed",
    });
    expect(firebaseMocks.transaction.set).not.toHaveBeenCalled();
  });

  it("rejects a live lease", async () => {
    firebaseMocks.setSnapshot({
      status: "processing",
      claimedAt: new firebaseMocks.MockTimestamp(1_799_999_999_000),
    });

    await expect(claimVideo("video-id", "user-id")).resolves.toEqual({
      status: "leased",
    });
    expect(firebaseMocks.transaction.set).not.toHaveBeenCalled();
  });

  it("takes over an expired lease", async () => {
    firebaseMocks.setSnapshot({
      status: "processing",
      claimedAt: new firebaseMocks.MockTimestamp(
        1_800_000_000_000 - 66 * 60 * 1_000,
      ),
    });

    await expect(claimVideo("video-id", "user-id")).resolves.toMatchObject({
      status: "claimed",
    });
    expect(firebaseMocks.transaction.set).toHaveBeenCalledOnce();
  });

  it("falls back to the upload timestamp when claimedAt is absent", async () => {
    firebaseMocks.setNow(1_725_004_000_001);
    firebaseMocks.setSnapshot({ status: "processing" });

    await expect(
      claimVideo("legacy-user-1725000000000", "user-id"),
    ).resolves.toMatchObject({ status: "claimed" });

    firebaseMocks.setSnapshot({ status: "processing" });
    await expect(claimVideo("video-without-time", "user-id")).resolves.toEqual({
      status: "leased",
    });
  });
});

describe("completeVideo", () => {
  it("completes only a matching claim and deletes lease fields", async () => {
    firebaseMocks.setSnapshot({
      status: "processing",
      claimToken: "claim-token",
    });

    await expect(
      completeVideo("video-id", "claim-token", "processed-video-360p.mp4", [
        "360p",
        "720p",
      ]),
    ).resolves.toBe(true);
    expect(firebaseMocks.transaction.set).toHaveBeenCalledWith(
      firebaseMocks.videoReference,
      {
        status: "processed",
        filename: "processed-video-360p.mp4",
        renditions: ["360p", "720p"],
        claimToken: firebaseMocks.deleteField,
        claimedAt: firebaseMocks.deleteField,
        updatedAt: expect.any(firebaseMocks.MockTimestamp),
      },
      { merge: true },
    );
    expect(firebaseMocks.fieldDelete).toHaveBeenCalledTimes(2);
  });

  it.each([
    { status: "processing", claimToken: "other-token" },
    { status: "failed", claimToken: "claim-token" },
  ])("rejects a token mismatch or wrong status", async (video) => {
    firebaseMocks.setSnapshot(video);

    await expect(
      completeVideo("video-id", "claim-token", "processed-video-360p.mp4", [
        "360p",
      ]),
    ).resolves.toBe(false);
    expect(firebaseMocks.transaction.set).not.toHaveBeenCalled();
  });
});

describe("failVideo", () => {
  it("marks a matching active claim failed and clears its lease", async () => {
    firebaseMocks.setSnapshot({
      status: "processing",
      claimToken: "claim-token",
    });

    await failVideo("video-id", "claim-token");

    expect(firebaseMocks.transaction.set).toHaveBeenCalledWith(
      firebaseMocks.videoReference,
      {
        status: "failed",
        claimToken: firebaseMocks.deleteField,
        claimedAt: firebaseMocks.deleteField,
        updatedAt: expect.any(firebaseMocks.MockTimestamp),
      },
      { merge: true },
    );
  });

  it("ignores a stale failure", async () => {
    firebaseMocks.setSnapshot({
      status: "processed",
      claimToken: "other-token",
    });

    await failVideo("video-id", "claim-token");
    expect(firebaseMocks.transaction.set).not.toHaveBeenCalled();
  });
});
