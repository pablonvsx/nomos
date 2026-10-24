import NetInfo from "@react-native-community/netinfo";

/** Whether the device reports a connection right now; null when it cannot tell. Never throws. */
export async function isOnline(): Promise<boolean | null> {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected ?? null;
  } catch {
    return null;
  }
}
