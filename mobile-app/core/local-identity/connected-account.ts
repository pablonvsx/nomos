import { getCurrentGoogleAccount } from "@/core/google-auth/google-auth-service";

/**
 * The currently connected Google account's email, or null if none is
 * connected. Single shared call site for the non-blocking owner_email
 * check (section 14.3) used by points package import (Fase 2) and Drive
 * restore (Fase 7).
 */
export async function getConnectedGoogleAccountEmail(): Promise<string | null> {
  return getCurrentGoogleAccount()?.email ?? null;
}
