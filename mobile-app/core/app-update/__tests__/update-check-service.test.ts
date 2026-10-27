import { CACHE_STORAGE_KEY, CACHE_TTL_MS, FETCH_TIMEOUT_MS, VERSION_MANIFEST_URL } from "../constants";
import { checkForUpdate, type UpdateCheckStorage } from "../update-check-service";

const PUBLISHED = {
  format_version: 1,
  latest_version: "1.0.0",
  min_supported_version: "1.0.0",
  released_at: "2026-10-26",
};

const NOW = 1_800_000_000_000;

function makeStorage(initial?: Record<string, string>) {
  const data = new Map<string, string>(Object.entries(initial ?? {}));
  const storage: UpdateCheckStorage & { data: Map<string, string> } = {
    data,
    getItem: jest.fn(async (key: string) => data.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      data.set(key, value);
    }),
  };
  return storage;
}

function cacheEntry(latestVersion: string, checkedAt: number) {
  return JSON.stringify({ latest_version: latestVersion, checked_at: checkedAt });
}

function jsonResponse(body: unknown, status = 200) {
  return { status, ok: status >= 200 && status < 300, json: async () => body } as unknown as Response;
}

const okFetch = (body: unknown = PUBLISHED) => jest.fn(async () => jsonResponse(body));

describe("checkForUpdate: network results", () => {
  it("is upToDate when installed equals the published version", async () => {
    const result = await checkForUpdate({
      installedVersion: "1.0.0",
      storage: makeStorage(),
      fetchFn: okFetch(),
      now: () => NOW,
    });
    expect(result).toEqual({ status: "upToDate", latestVersion: "1.0.0", fromCache: false });
  });

  it("is updateAvailable when installed is older", async () => {
    const result = await checkForUpdate({
      installedVersion: "0.9.0",
      storage: makeStorage(),
      fetchFn: okFetch(),
      now: () => NOW,
    });
    expect(result).toEqual({ status: "updateAvailable", latestVersion: "1.0.0", fromCache: false });
  });

  it("is upToDate when the installed build is newer than the published one", async () => {
    const result = await checkForUpdate({
      installedVersion: "1.1.0",
      storage: makeStorage(),
      fetchFn: okFetch(),
      now: () => NOW,
    });
    expect(result).toMatchObject({ status: "upToDate", latestVersion: "1.0.0" });
  });

  it("queries exactly VERSION_MANIFEST_URL, no-store, with no custom headers", async () => {
    const fetchFn = okFetch();
    await checkForUpdate({ installedVersion: "1.0.0", storage: makeStorage(), fetchFn, now: () => NOW });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchFn.mock.calls[0] as unknown) as [string, RequestInit];
    expect(url).toBe(VERSION_MANIFEST_URL);
    expect(init.cache).toBe("no-store");
    expect(init.headers).toBeUndefined();
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("uses HTTPS only", () => {
    expect(VERSION_MANIFEST_URL).toBe("https://pablonvsx.github.io/nomos/nomos-version.json");
    expect(VERSION_MANIFEST_URL.startsWith("https://")).toBe(true);
  });

  it("is an error for HTTP 404", async () => {
    const result = await checkForUpdate({
      installedVersion: "1.0.0",
      storage: makeStorage(),
      fetchFn: jest.fn(async () => jsonResponse({}, 404)),
      now: () => NOW,
    });
    expect(result).toMatchObject({ status: "error", reason: "http_status" });
  });

  it("is an error for a 2xx that is not exactly 200", async () => {
    const result = await checkForUpdate({
      installedVersion: "1.0.0",
      storage: makeStorage(),
      fetchFn: jest.fn(async () => jsonResponse(PUBLISHED, 204)),
      now: () => NOW,
    });
    expect(result).toMatchObject({ status: "error", reason: "http_status" });
  });

  it("is an error for a body that is not JSON", async () => {
    const result = await checkForUpdate({
      installedVersion: "1.0.0",
      storage: makeStorage(),
      fetchFn: jest.fn(async () => ({ status: 200, ok: true, json: async () => { throw new SyntaxError("bad"); } }) as unknown as Response),
      now: () => NOW,
    });
    expect(result).toMatchObject({ status: "error", reason: "invalid_response" });
  });

  it("is an error when validation fails (unknown format_version)", async () => {
    const result = await checkForUpdate({
      installedVersion: "1.0.0",
      storage: makeStorage(),
      fetchFn: okFetch({ ...PUBLISHED, format_version: 2 }),
      now: () => NOW,
    });
    expect(result).toMatchObject({ status: "error", reason: "invalid_response" });
  });

  it("is an error when there is no network", async () => {
    const result = await checkForUpdate({
      installedVersion: "1.0.0",
      storage: makeStorage(),
      fetchFn: jest.fn(async () => {
        throw new TypeError("Network request failed");
      }),
      now: () => NOW,
    });
    expect(result).toMatchObject({ status: "error", reason: "network" });
  });

  it("does not call the network when the installed version is invalid", async () => {
    const fetchFn = okFetch();
    const result = await checkForUpdate({ installedVersion: "", storage: makeStorage(), fetchFn, now: () => NOW });
    expect(result).toMatchObject({ status: "error", reason: "invalid_installed_version" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("checkForUpdate: timeout", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("gives up after FETCH_TIMEOUT_MS (15 s) when fetch never responds", async () => {
    expect(FETCH_TIMEOUT_MS).toBe(15_000);
    const fetchFn = jest.fn(() => new Promise<Response>(() => {}));
    let settled = false;
    const pending = checkForUpdate({
      installedVersion: "1.0.0",
      storage: makeStorage(),
      fetchFn,
      now: () => NOW,
    }).then((r) => {
      settled = true;
      return r;
    });

    await jest.advanceTimersByTimeAsync(FETCH_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({ status: "error", reason: "timeout" });
  });
});

describe("checkForUpdate: cache", () => {
  it("writes the cache on success", async () => {
    const storage = makeStorage();
    await checkForUpdate({ installedVersion: "1.0.0", storage, fetchFn: okFetch(), now: () => NOW });
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.data.get(CACHE_STORAGE_KEY)!)).toEqual({ latest_version: "1.0.0", checked_at: NOW });
  });

  it("does not write the cache on an error", async () => {
    const storage = makeStorage();
    await checkForUpdate({
      installedVersion: "1.0.0",
      storage,
      fetchFn: jest.fn(async () => jsonResponse({}, 500)),
      now: () => NOW,
    });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("does not hit the network within 6 hours of the last success", async () => {
    expect(CACHE_TTL_MS).toBe(6 * 60 * 60 * 1000);
    const fetchFn = okFetch();
    const storage = makeStorage({ [CACHE_STORAGE_KEY]: cacheEntry("1.5.0", NOW - CACHE_TTL_MS + 1) });
    const result = await checkForUpdate({ installedVersion: "1.1.0", storage, fetchFn, now: () => NOW });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "updateAvailable", latestVersion: "1.5.0", fromCache: true });
  });

  it("recomputes the state against the installed version when reading the cache", async () => {
    const storage = makeStorage({ [CACHE_STORAGE_KEY]: cacheEntry("1.5.0", NOW - 1000) });
    const result = await checkForUpdate({ installedVersion: "1.5.0", storage, fetchFn: okFetch(), now: () => NOW });
    expect(result).toMatchObject({ status: "upToDate", fromCache: true });
  });

  it("queries again once the cache is 6 hours old, and refreshes it", async () => {
    const fetchFn = okFetch({ ...PUBLISHED, latest_version: "1.2.0" });
    const storage = makeStorage({ [CACHE_STORAGE_KEY]: cacheEntry("1.0.0", NOW - CACHE_TTL_MS) });
    const result = await checkForUpdate({ installedVersion: "1.1.0", storage, fetchFn, now: () => NOW });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: "updateAvailable", latestVersion: "1.2.0", fromCache: false });
    expect(JSON.parse(storage.data.get(CACHE_STORAGE_KEY)!)).toEqual({ latest_version: "1.2.0", checked_at: NOW });
  });

  it("keeps showing the last good result when the network fails after expiry, and keeps it stored", async () => {
    const stale = cacheEntry("1.5.0", NOW - 10 * CACHE_TTL_MS);
    const storage = makeStorage({ [CACHE_STORAGE_KEY]: stale });
    const result = await checkForUpdate({
      installedVersion: "1.1.0",
      storage,
      fetchFn: jest.fn(async () => {
        throw new TypeError("Network request failed");
      }),
      now: () => NOW,
    });
    expect(result).toEqual({ status: "updateAvailable", latestVersion: "1.5.0", fromCache: true });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.data.get(CACHE_STORAGE_KEY)).toBe(stale);
  });

  it("treats a cache stamped in the future as expired", async () => {
    const fetchFn = okFetch();
    const storage = makeStorage({ [CACHE_STORAGE_KEY]: cacheEntry("9.9.9", NOW + 60_000) });
    await checkForUpdate({ installedVersion: "1.1.0", storage, fetchFn, now: () => NOW });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it.each(["not json", "{}", JSON.stringify({ latest_version: "abc", checked_at: NOW }), JSON.stringify({ latest_version: "1.0.0", checked_at: "x" })])(
    "ignores a corrupt cache entry (%s) and queries the network",
    async (raw) => {
      const fetchFn = okFetch();
      const storage = makeStorage({ [CACHE_STORAGE_KEY]: raw });
      const result = await checkForUpdate({ installedVersion: "1.1.0", storage, fetchFn, now: () => NOW });
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ status: "upToDate", fromCache: false });
    },
  );

  it("never throws when storage fails", async () => {
    const storage: UpdateCheckStorage = {
      getItem: jest.fn(async () => {
        throw new Error("disk");
      }),
      setItem: jest.fn(async () => {
        throw new Error("disk");
      }),
    };
    const result = await checkForUpdate({ installedVersion: "1.1.0", storage, fetchFn: okFetch(), now: () => NOW });
    expect(result).toMatchObject({ status: "upToDate", fromCache: false });
  });
});
