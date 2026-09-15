/**
 * Stub for the Google account connection state, ahead of the Drive backup
 * phase. Points package import (Fase 2) needs a call site for the
 * non-blocking owner_email check (see core/project-sharing/import-points.ts)
 * before any Drive/Google Sign-In integration actually exists, so the
 * comparison is already wired correctly and just never warns yet.
 */
export async function getConnectedGoogleAccountEmail(): Promise<string | null> {
  // TODO(Drive backup phase): return the real signed-in account's email
  // once Google Sign-In is integrated.
  return null;
}
