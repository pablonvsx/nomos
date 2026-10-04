// A stalled connection must not leave an operation (and the screen's lock)
// waiting forever: React Native's Android OkHttp client runs with timeouts of
// 0 (no limit). These tests use fake timers and a fetch that never answers.

const downloadFileAsyncMock = jest.fn();
jest.mock("expo-file-system", () => {
  class File {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    async base64() {
      return "ZmFrZQ==";
    }
    async bytes() {
      return new Uint8Array([1, 2, 3]);
    }
    static downloadFileAsync(...args: unknown[]) {
      return downloadFileAsyncMock(...args);
    }
  }
  return { File };
});

jest.mock("@/core/google-auth/google-auth-service", () => ({
  getDriveAccessToken: jest.fn(async () => "token"),
}));

import {
  DRIVE_METADATA_TIMEOUT_MS,
  DRIVE_TRANSFER_TIMEOUT_MS,
  DriveTimeoutError,
  downloadBinaryFile,
  findChildByName,
  readJsonFile,
  updateBinaryFile,
  uploadBinaryFile,
  uploadJsonFile,
} from "../drive-api-client";
import { NetworkTimeoutError } from "@/core/net/network-timeout";

const fetchMock = jest.fn();
const originalFetch = global.fetch;

/** A fetch that never answers, but honours the abort signal like the real one. */
function hangingFetch(signalLog: AbortSignal[] = []) {
  return (_url: string, init?: { signal?: AbortSignal }) =>
    new Promise<Response>((_, reject) => {
      if (init?.signal) {
        signalLog.push(init.signal);
        init.signal.addEventListener("abort", () => reject(new Error("The operation was aborted")));
      }
    });
}

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
  global.fetch = originalFetch;
});

describe("timeout levels", () => {
  it("uses a short level for metadata/JSON and a longer one for media", () => {
    expect(DRIVE_METADATA_TIMEOUT_MS).toBe(30_000);
    expect(DRIVE_TRANSFER_TIMEOUT_MS).toBe(180_000);
    expect(DRIVE_TRANSFER_TIMEOUT_MS).toBeGreaterThan(DRIVE_METADATA_TIMEOUT_MS);
  });
});

describe("metadata and JSON requests (short timeout)", () => {
  it("findChildByName throws DriveTimeoutError after the limit - and not before", async () => {
    const signals: AbortSignal[] = [];
    fetchMock.mockImplementation(hangingFetch(signals));
    const outcome = findChildByName("parent", "x.json").catch((error) => error);

    await jest.advanceTimersByTimeAsync(DRIVE_METADATA_TIMEOUT_MS - 1);
    expect(signals[0].aborted).toBe(false);

    await jest.advanceTimersByTimeAsync(1);
    const error = await outcome;
    expect(error).toBeInstanceOf(DriveTimeoutError);
    expect(error).toBeInstanceOf(NetworkTimeoutError);
    expect(signals[0].aborted).toBe(true);
  });

  it("uploadJsonFile and readJsonFile use the short level too", async () => {
    fetchMock.mockImplementation(hangingFetch());
    const upload = uploadJsonFile("a.json", "parent", { a: 1 }).catch((error) => error);
    const read = readJsonFile("file-id").catch((error) => error);

    await jest.advanceTimersByTimeAsync(DRIVE_METADATA_TIMEOUT_MS);

    expect(await upload).toBeInstanceOf(DriveTimeoutError);
    expect(await read).toBeInstanceOf(DriveTimeoutError);
  });

  it("also covers a body that stalls after the headers arrived", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => new Promise(() => {}),
      text: () => new Promise(() => {}),
    } as unknown as Response);
    const outcome = readJsonFile("file-id").catch((error) => error);

    await jest.advanceTimersByTimeAsync(DRIVE_METADATA_TIMEOUT_MS);

    expect(await outcome).toBeInstanceOf(DriveTimeoutError);
  });

  it("a fast response is unaffected and leaves no timer behind", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ files: [{ id: "1", name: "x.json", mimeType: "application/json" }] }));

    await expect(findChildByName("parent", "x.json")).resolves.toEqual({
      id: "1",
      name: "x.json",
      mimeType: "application/json",
    });
    expect(jest.getTimerCount()).toBe(0);
  });

  it("an HTTP error before the limit stays an ordinary Error", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: async () => "boom" } as Response);

    const error = await findChildByName("parent", "x").catch((e) => e);

    expect(error).not.toBeInstanceOf(DriveTimeoutError);
    expect(error.message).toContain("Drive API error (500)");
  });
});

describe("media transfers (long timeout)", () => {
  it("uploadBinaryFile and updateBinaryFile survive past the short limit and fail at the long one", async () => {
    const signals: AbortSignal[] = [];
    fetchMock.mockImplementation(hangingFetch(signals));
    const upload = uploadBinaryFile("p.jpg", "parent", "file:///p.jpg", "image/jpeg").catch((e) => e);
    const update = updateBinaryFile("id", "file:///p.jpg", "image/jpeg").catch((e) => e);

    await jest.advanceTimersByTimeAsync(DRIVE_METADATA_TIMEOUT_MS + 1);
    expect(signals.every((signal) => !signal.aborted)).toBe(true);

    await jest.advanceTimersByTimeAsync(DRIVE_TRANSFER_TIMEOUT_MS - DRIVE_METADATA_TIMEOUT_MS);
    expect(await upload).toBeInstanceOf(DriveTimeoutError);
    expect(await update).toBeInstanceOf(DriveTimeoutError);
  });
});

describe("downloadBinaryFile (File.downloadFileAsync cannot be aborted)", () => {
  it("rejects with DriveTimeoutError after the long limit even though the native call never settles", async () => {
    downloadFileAsyncMock.mockImplementation(() => new Promise(() => {}));
    const outcome = downloadBinaryFile("file-id", "file:///dest.jpg").catch((error) => error);

    await jest.advanceTimersByTimeAsync(DRIVE_TRANSFER_TIMEOUT_MS - 1);
    expect(jest.getTimerCount()).toBe(1);

    await jest.advanceTimersByTimeAsync(1);
    expect(await outcome).toBeInstanceOf(DriveTimeoutError);
  });

  it("a download that finishes in time resolves normally", async () => {
    downloadFileAsyncMock.mockResolvedValue(undefined);

    await expect(downloadBinaryFile("file-id", "file:///dest.jpg")).resolves.toBeUndefined();
    expect(jest.getTimerCount()).toBe(0);
  });
});
