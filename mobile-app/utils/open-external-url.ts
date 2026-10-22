// mobile-app/utils/open-external-url.ts
//
// Opens an external link without ever throwing. Takes the opener as a
// parameter (callers pass react-native's Linking.openURL) so the logic stays
// free of native imports and testable under plain Node. Only ever called on
// an explicit user action: the app is offline-first, so no feature depends on
// a link being reachable.

/** Returns true if the opener accepted the URL, false if it threw/rejected (e.g. no browser installed). */
export async function openExternalUrl(
  url: string,
  openURL: (url: string) => Promise<unknown>,
): Promise<boolean> {
  try {
    await openURL(url);
    return true;
  } catch {
    return false;
  }
}
