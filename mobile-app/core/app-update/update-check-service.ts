// mobile-app/core/app-update/update-check-service.ts
//
// Checks whether a newer app version is published. Offline-first: it never
// throws, never blocks the app, sends no device or user identifier and no
// custom header. Only successful results are cached (CACHE_TTL_MS); an error
// is not stored, so the next call tries again, and a network failure falls
// back to the last good cached result. Free of react-native imports: fetch and
// storage are injected (the screen's hook passes fetch and AsyncStorage).

import { NetworkTimeoutError, isNetworkTimeoutError, withTimeout } from "@/core/net/network-timeout";
import { compareVersions, parseVersion } from "./compare-versions";
import { CACHE_STORAGE_KEY, CACHE_TTL_MS, FETCH_TIMEOUT_MS, VERSION_MANIFEST_URL } from "./constants";
import { validateVersionManifest } from "./version-manifest";

export interface UpdateCheckStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export type UpdateErrorReason =
  | "invalid_installed_version"
  | "timeout"
  | "network"
  | "http_status"
  | "invalid_response";

export type UpdateStatus =
  | {
      status: "upToDate" | "updateAvailable";
      latestVersion: string;
      /** True when the answer came from the stored result instead of a new request. */
      fromCache: boolean;
    }
  | { status: "error"; reason: UpdateErrorReason };

export interface CheckForUpdateOptions {
  /** Raw installed version, e.g. "1.1.0". */
  installedVersion: string;
  storage: UpdateCheckStorage;
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
  now?: () => number;
}

interface CachedResult {
  latestVersion: string;
  checkedAt: number;
}

async function readCache(storage: UpdateCheckStorage): Promise<CachedResult | null> {
  try {
    const raw = await storage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof data?.latest_version !== "string" ||
      !parseVersion(data.latest_version) ||
      typeof data.checked_at !== "number" ||
      !Number.isFinite(data.checked_at)
    ) {
      return null;
    }
    return { latestVersion: data.latest_version, checkedAt: data.checked_at };
  } catch {
    return null;
  }
}

async function writeCache(storage: UpdateCheckStorage, latestVersion: string, checkedAt: number): Promise<void> {
  try {
    await storage.setItem(CACHE_STORAGE_KEY, JSON.stringify({ latest_version: latestVersion, checked_at: checkedAt }));
  } catch {
    // A cache that cannot be written only costs one more request later.
  }
}

/** A stamp in the future (clock moved back) is never fresh. */
function isFresh(cached: CachedResult, now: number): boolean {
  const age = now - cached.checkedAt;
  return age >= 0 && age < CACHE_TTL_MS;
}

function resolveStatus(installedVersion: string, latestVersion: string, fromCache: boolean): UpdateStatus {
  const order = compareVersions(installedVersion, latestVersion);
  if (order === null) return { status: "error", reason: "invalid_response" };
  // Installed >= published (including a development build ahead of the release) is up to date.
  return { status: order < 0 ? "updateAvailable" : "upToDate", latestVersion, fromCache };
}

type FetchOutcome = { kind: "http_status" } | { kind: "invalid_body" } | { kind: "body"; body: unknown };

export async function checkForUpdate({
  installedVersion,
  storage,
  fetchFn = (url, init) => fetch(url, init),
  now = Date.now,
}: CheckForUpdateOptions): Promise<UpdateStatus> {
  if (!parseVersion(installedVersion)) return { status: "error", reason: "invalid_installed_version" };

  const cached = await readCache(storage);
  if (cached && isFresh(cached, now())) return resolveStatus(installedVersion, cached.latestVersion, true);

  // Any failure from here on keeps showing the last good result, if there is one.
  const fallback = (reason: UpdateErrorReason): UpdateStatus =>
    cached ? resolveStatus(installedVersion, cached.latestVersion, true) : { status: "error", reason };

  let outcome: FetchOutcome;
  try {
    outcome = await withTimeout<FetchOutcome>(
      async (signal) => {
        const response = await fetchFn(VERSION_MANIFEST_URL, { cache: "no-store", signal });
        if (response.status !== 200) return { kind: "http_status" };
        try {
          return { kind: "body", body: await response.json() };
        } catch {
          return { kind: "invalid_body" };
        }
      },
      FETCH_TIMEOUT_MS,
      () => new NetworkTimeoutError(FETCH_TIMEOUT_MS),
    );
  } catch (error) {
    return fallback(isNetworkTimeoutError(error) ? "timeout" : "network");
  }

  if (outcome.kind === "http_status") return fallback("http_status");
  if (outcome.kind === "invalid_body") return fallback("invalid_response");

  const validated = validateVersionManifest(outcome.body);
  if (!validated.ok) return fallback("invalid_response");

  await writeCache(storage, validated.manifest.latestVersion, now());
  return resolveStatus(installedVersion, validated.manifest.latestVersion, false);
}
