// A short code the person collecting identifies themselves with when
// exporting points to a project owner, independent of any Google account -
// this is what lets someone without Drive access collect and hand off data.
// See core/project-sharing/export-points.ts and core/drive-sync/point-label.ts.
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "nomos:local_collector_code";

export async function getLocalCollectorCode(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEY);
}

export async function setLocalCollectorCode(code: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, code.trim().toUpperCase());
}
