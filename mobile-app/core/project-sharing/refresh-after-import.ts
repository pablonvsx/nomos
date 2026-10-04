/**
 * Runs right after an import operation finishes (config package, points
 * package, or a duplicate resolution): drops cached map data and refetches
 * what the screen shows, instead of waiting for a navigation to trigger it.
 * The cache is cleared first so nothing re-reads stale data during the reload.
 */
export async function refreshAfterImport(deps: {
  clearMapData: () => void;
  reload: () => Promise<void>;
}): Promise<void> {
  deps.clearMapData();
  await deps.reload();
}
