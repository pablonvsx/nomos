/**
 * Shared progress/cancellation types for the GBIF and SpeciesLink search services.
 */

export type SpeciesSearchStatus = "counting" | "fetching" | "processing" | "complete";

export interface SpeciesSearchProgress {
  status: SpeciesSearchStatus;
  currentPage: number;
  totalPages: number;
  fetchedOccurrences: number;
  totalOccurrences: number;
  uniqueSpecies: number;
  // Only used during GBIF's per-species detail enrichment phase (status: 'processing')
  processedSpecies?: number;
  totalSpeciesToProcess?: number;
}

export class SearchCancelledError extends Error {
  constructor() {
    super("Search cancelled by user");
    this.name = "SearchCancelledError";
  }
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new SearchCancelledError();
  }
}
