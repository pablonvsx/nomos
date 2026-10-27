// mobile-app/core/app-update/constants.ts
//
// Settings of the app update check. Kept out of the screen so they are easy to
// find and change (see docs/14_APP_UPDATE_CHECK.md).

/** Published by the project page (GitHub Pages, branch gh-pages). HTTPS only. */
export const VERSION_MANIFEST_URL = "https://pablonvsx.github.io/nomos/nomos-version.json";

/** The only nomos-version.json layout this build understands. */
export const SUPPORTED_MANIFEST_FORMAT_VERSION = 1;

/** How long a stalled request may keep the check waiting. */
export const FETCH_TIMEOUT_MS = 15_000;

/** A successful result is reused for this long before the network is asked again. */
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export const CACHE_STORAGE_KEY = "@nomos:app_update_check";
