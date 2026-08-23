import { useEffect, useState } from "react";
import { initDatabase } from "@/db/initialize";

interface UseAppBootstrapResult {
  isReady: boolean;
  hasError: boolean;
  error: unknown;
}

export function useAppBootstrap(): UseAppBootstrapResult {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      try {
        await initDatabase();
        if (isMounted) {
          setIsReady(true);
        }
      } catch (bootstrapError) {
        if (isMounted) {
          setError(bootstrapError);
        }
      }
    };

    bootstrap();

    return () => {
      isMounted = false;
    };
  }, []);

  return {
    isReady,
    hasError: error !== null,
    error,
  };
}
