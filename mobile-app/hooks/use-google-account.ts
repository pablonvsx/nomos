import { useCallback, useState } from "react";
import {
  connectGoogleAccount,
  disconnectGoogleAccount,
  getInitialGoogleAccountState,
} from "@/core/google-auth/google-account-controller";
import { getCurrentGoogleAccount } from "@/core/google-auth/google-auth-service";
import type { GoogleAccount, SignInOptions } from "@/core/google-auth/google-auth-service";

export interface UseGoogleAccountResult {
  account: GoogleAccount | null;
  isConnecting: boolean;
  error: string | null;
  unavailable: boolean;
  /** Resolves with the connected account, or null when sign-in failed/was cancelled (the error is in `error`). */
  connect: (options?: SignInOptions) => Promise<GoogleAccount | null>;
  disconnect: () => Promise<void>;
  /** Re-reads the account from the native module: every hook instance keeps its own state, so another screen may have connected/disconnected since this one mounted. */
  refresh: () => void;
}

export function useGoogleAccount(): UseGoogleAccountResult {
  const [state, setState] = useState(getInitialGoogleAccountState);

  const connect = useCallback(
    async (options?: SignInOptions) => {
      const finalState = await connectGoogleAccount(setState, state, options);
      setState(finalState);
      return finalState.account;
    },
    [state],
  );

  const disconnect = useCallback(async () => {
    const finalState = await disconnectGoogleAccount(state);
    setState(finalState);
  }, [state]);

  const refresh = useCallback(() => {
    setState((prev) => ({ ...prev, account: getCurrentGoogleAccount(), error: null, unavailable: false }));
  }, []);

  return { ...state, connect, disconnect, refresh };
}
