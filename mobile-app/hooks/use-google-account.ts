import { useCallback, useEffect, useState } from 'react';
import {
  getCurrentGoogleAccount,
  signInWithGoogle,
  signOutFromGoogle,
  type GoogleAccount,
} from '@/core/google-auth/google-auth-service';

interface UseGoogleAccountResult {
  account: GoogleAccount | null;
  isConnecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export function useGoogleAccount(): UseGoogleAccountResult {
  const [account, setAccount] = useState<GoogleAccount | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAccount(getCurrentGoogleAccount());
  }, []);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    try {
      setAccount(await signInWithGoogle());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao conectar com o Google.');
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await signOutFromGoogle();
    setAccount(null);
  }, []);

  return { account, isConnecting, error, connect, disconnect };
}
