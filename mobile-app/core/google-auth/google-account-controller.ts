import {
  getCurrentGoogleAccount,
  signInWithGoogle,
  signOutFromGoogle,
  GoogleSignInUnavailableError,
  type GoogleAccount,
} from "@/core/google-auth/google-auth-service";

export interface GoogleAccountState {
  account: GoogleAccount | null;
  isConnecting: boolean;
  error: string | null;
  /** Set when `error` is specifically GoogleSignInUnavailableError (e.g. running in Expo Go), so the UI can show a more specific message than a generic failure. */
  unavailable: boolean;
}

/**
 * Pure (React-free) state machine backing hooks/use-google-account.ts.
 * Kept separate from the hook so it can be unit tested under the project's
 * current ts-jest/node setup, which has no React rendering support yet.
 */
export function getInitialGoogleAccountState(): GoogleAccountState {
  return {
    account: getCurrentGoogleAccount(),
    isConnecting: false,
    error: null,
    unavailable: false,
  };
}

export async function connectGoogleAccount(
  onStateChange: (state: GoogleAccountState) => void,
  currentState: GoogleAccountState,
): Promise<GoogleAccountState> {
  onStateChange({ ...currentState, isConnecting: true, error: null, unavailable: false });

  try {
    const account = await signInWithGoogle();
    return { account, isConnecting: false, error: null, unavailable: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...currentState,
      isConnecting: false,
      error: message,
      unavailable: error instanceof GoogleSignInUnavailableError,
    };
  }
}

export async function disconnectGoogleAccount(
  currentState: GoogleAccountState,
): Promise<GoogleAccountState> {
  try {
    await signOutFromGoogle();
    return { ...currentState, account: null, error: null, unavailable: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...currentState,
      error: message,
      unavailable: error instanceof GoogleSignInUnavailableError,
    };
  }
}
