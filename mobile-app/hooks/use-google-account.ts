import { useCallback, useState } from "react";
import {
  connectGoogleAccount,
  disconnectGoogleAccount,
  getInitialGoogleAccountState,
} from "@/core/google-auth/google-account-controller";
import type { GoogleAccount } from "@/core/google-auth/google-auth-service";

export interface UseGoogleAccountResult {
  account: GoogleAccount | null;
  isConnecting: boolean;
  error: string | null;
  unavailable: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export function useGoogleAccount(): UseGoogleAccountResult {
  const [state, setState] = useState(getInitialGoogleAccountState);

  const connect = useCallback(async () => {
    const finalState = await connectGoogleAccount(setState, state);
    setState(finalState);
  }, [state]);

  const disconnect = useCallback(async () => {
    const finalState = await disconnectGoogleAccount(state);
    setState(finalState);
  }, [state]);

  return { ...state, connect, disconnect };
}
