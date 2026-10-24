// mobile-app/utils/app-version.ts
//
// Pure formatting for the installed app version, kept free of expo-constants
// so it runs under plain Node. The version itself comes from package.json via
// app.config.js (see constants/app-version.ts).

/** "1.1.0" -> "v1.1.0". Empty when the version is unavailable. */
export function formatAppVersion(version: string | null | undefined): string {
  const trimmed = version?.trim().replace(/^v/i, "") ?? "";
  return trimmed ? `v${trimmed}` : "";
}
