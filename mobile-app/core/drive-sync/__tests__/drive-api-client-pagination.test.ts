// listChildren used to read one page (pageSize 1000) and drop the rest, so a
// folder with more children than that silently lost points. It must follow
// nextPageToken, with each page under the metadata timeout and a page cap.

jest.mock("expo-file-system", () => ({ File: class {} }));
jest.mock("@/core/google-auth/google-auth-service", () => ({
  getDriveAccessToken: jest.fn(async () => "token"),
}));

import { DRIVE_METADATA_TIMEOUT_MS, DriveTimeoutError, LIST_CHILDREN_MAX_PAGES, listChildren } from "../drive-api-client";

const fetchMock = jest.fn();
const originalFetch = global.fetch;

const file = (name: string) => ({ id: `id-${name}`, name, mimeType: "x" });
function page(files: ReturnType<typeof file>[], nextPageToken?: string): Response {
  const body = { files, nextPageToken };
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  jest.useRealTimers();
  global.fetch = originalFetch;
});

describe("listChildren pagination", () => {
  it("accumulates every page, in order, passing the token on", async () => {
    fetchMock
      .mockResolvedValueOnce(page([file("a"), file("b")], "t1"))
      .mockResolvedValueOnce(page([file("c"), file("d")], "t2"))
      .mockResolvedValueOnce(page([file("e")]));

    const result = await listChildren("parent");

    expect(result.map((f) => f.name)).toEqual(["a", "b", "c", "d", "e"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).not.toContain("pageToken");
    expect(fetchMock.mock.calls[1][0]).toContain("pageToken=t1");
    expect(fetchMock.mock.calls[2][0]).toContain("pageToken=t2");
  });

  it("makes a single request when there is no next page", async () => {
    fetchMock.mockResolvedValueOnce(page([file("a")]));
    expect(await listChildren("parent")).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops at the page cap instead of looping forever on a token that never ends", async () => {
    fetchMock.mockImplementation(async () => page([file("x")], "again"));
    const result = await listChildren("parent");
    expect(fetchMock).toHaveBeenCalledTimes(LIST_CHILDREN_MAX_PAGES);
    expect(result).toHaveLength(LIST_CHILDREN_MAX_PAGES);
  });

  it("puts every page under its own metadata timeout", async () => {
    jest.useFakeTimers();
    fetchMock.mockResolvedValueOnce(page([file("a")], "t1")).mockImplementationOnce(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );

    const outcome = listChildren("parent").catch((error) => error);
    await jest.advanceTimersByTimeAsync(DRIVE_METADATA_TIMEOUT_MS);

    expect(await outcome).toBeInstanceOf(DriveTimeoutError);
  });
});
