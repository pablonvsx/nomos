# App update check

The Resources screen (`mobile-app/app/(tabs)/resources.tsx`) shows one short line under the installed version that says whether it is the latest one. There is no new button or link: the existing "Open Nomos page" button remains the way to reach the download.

Code: `mobile-app/core/app-update/` (pure logic, runs under plain Node), `mobile-app/hooks/use-app-update-status.ts` (binds it to the screen), strings under `resources.update*` in `mobile-app/locales/`.

## The version file

The project page publishes it at:

```
https://pablonvsx.github.io/nomos/nomos-version.json
```

```json
{
  "format_version": 1,
  "latest_version": "1.0.0",
  "min_supported_version": "1.0.0",
  "released_at": "2026-10-26"
}
```

HTTPS only. The URL lives in `core/app-update/constants.ts`.

`min_supported_version` and `released_at` are **ignored for now**: the app reads only `format_version` and `latest_version`, and does not require the others to be present or valid. Unknown extra fields are ignored too.

## Validation (`version-manifest.ts`)

`validateVersionManifest` returns the validated manifest or a typed error; it never throws.

1. The payload must be a JSON object (`invalid_json`).
2. `format_version` must be exactly `1` (`unsupported_format`). This is checked before anything else, so a newer layout is never read optimistically.
3. `latest_version` must be present (`missing_latest_version`) and a valid semver string (`invalid_latest_version`).

Versions are compared by `compareVersions` (`compare-versions.ts`): numeric (1.10.0 is greater than 1.9.0), a prerelease is below its final version, build metadata is ignored, and invalid input compares as `null` without throwing.

## States and texts

| State | Condition | Text (pt) |
| --- | --- | --- |
| checking | request in progress | Verificando atualizações... |
| upToDate | installed >= `latest_version` (a development build ahead of the release counts) | Esta é a versão mais recente. |
| updateAvailable | installed < `latest_version` | Há uma nova versão disponível (X). Abra a página do Nomos para baixá-la. |
| error | network, timeout, HTTP other than 200, invalid JSON or failed validation, and nothing cached | Não foi possível verificar atualizações agora. |

The "update available" text names the page the way the existing button is labeled ("Abrir página do Nomos"). When the check fails but a good result is cached, the cached result is shown as if it were fresh. The line is an `accessibilityLiveRegion="polite"` text, so screen readers announce changes.

## Offline-first policy

- The check runs automatically each time the screen is focused, never blocks the screen or the app, and an error is never shown as a failure of the app.
- Request: `fetch(url, { cache: "no-store", signal })`, 15 s timeout (`withTimeout`), no custom headers, no device or user identifier. The server only sees the IP address, as in any visit to a web page.
- Cache (AsyncStorage, key `@nomos:app_update_check`): only **successful** results are stored (`latest_version` and the check time). Within 6 hours (`CACHE_TTL_MS`) the network is not asked. After that it is asked again. An error is not stored, so the next opening tries again, and a network failure keeps using the last good cached result. The state is recomputed against the installed version on every read, so updating the app never leaves a stale "update available".

## Publishing a new version

1. On the `gh-pages` branch, edit `nomos-version.json` at the root (bump `latest_version`, and optionally `released_at`).
2. Commit and push.
3. Wait a few minutes: GitHub Pages and its CDN keep a copy for a short time.
4. Open `https://pablonvsx.github.io/nomos/nomos-version.json` in a browser and confirm the new content.

Devices that already have a fresh cached result see the change within 6 hours. To test on a device, clear the app data or temporarily lower `CACHE_TTL_MS`.
