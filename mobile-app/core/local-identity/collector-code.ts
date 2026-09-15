import AsyncStorage from "@react-native-async-storage/async-storage";

const COLLECTOR_CODE_STORAGE_KEY = "@nomos:collector_code";
const COLLECTOR_CODE_LENGTH = 4;

export async function getLocalCollectorCode(): Promise<string | null> {
  return AsyncStorage.getItem(COLLECTOR_CODE_STORAGE_KEY);
}

/**
 * Persists the local collector code. Must be exactly 4 characters after
 * trim/uppercase - not 2-4, not optional. No uniqueness check against other
 * collaborators exists or is needed in this model (there is no shared
 * registry of codes).
 */
export async function setLocalCollectorCode(code: string): Promise<void> {
  const normalized = code.trim().toUpperCase();
  if (normalized.length !== COLLECTOR_CODE_LENGTH) {
    throw new Error(`Collector code must be exactly ${COLLECTOR_CODE_LENGTH} characters.`);
  }
  await AsyncStorage.setItem(COLLECTOR_CODE_STORAGE_KEY, normalized);
}
