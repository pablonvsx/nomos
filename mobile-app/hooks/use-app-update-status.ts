import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { APP_VERSION } from "@/constants/app-version";
import { checkForUpdate, type UpdateStatus } from "@/core/app-update/update-check-service";

export type AppUpdateState = { status: "checking" } | UpdateStatus;

/**
 * Checks for a newer app version each time the screen is focused. The result
 * of a recent check is reused (core/app-update/constants.ts: CACHE_TTL_MS), so
 * reopening the screen usually costs no request. Never throws and never
 * blocks rendering: the screen shows "checking" until the answer arrives.
 */
export function useAppUpdateStatus(): AppUpdateState {
  const [state, setState] = useState<AppUpdateState>({ status: "checking" });

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      checkForUpdate({ installedVersion: APP_VERSION, storage: AsyncStorage }).then((result) => {
        if (!cancelled) setState(result);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  return state;
}
