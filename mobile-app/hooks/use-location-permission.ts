import { useCallback, useState } from "react";
import * as Location from "expo-location";

export type LocationPermissionStatus = "unknown" | "granted" | "denied";

export function useLocationPermission() {
  const [status, setStatus] = useState<LocationPermissionStatus>("unknown");

  const ensurePermission = useCallback(async () => {
    try {
      const result = await Location.requestForegroundPermissionsAsync();
      const granted = result.status === "granted";
      setStatus(granted ? "granted" : "denied");
      return granted;
    } catch {
      setStatus("denied");
      return false;
    }
  }, []);

  return { status, ensurePermission };
}
