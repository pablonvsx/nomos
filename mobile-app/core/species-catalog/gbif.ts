/**
 * GBIF API Integration Service
 * Searches for plant species near geographic coordinates and retrieves their data
 * including multiple common names in different languages
 */

import { SpeciesSearchProgress, throwIfAborted } from "./search-progress";

const GBIF_OCCURRENCE_API = 'https://api.gbif.org/v1/occurrence/search';
const GBIF_SPECIES_API = 'https://api.gbif.org/v1/species';

// GBIF Taxon Key for Kingdom Plantae
const PLANTAE_TAXON_KEY = 6;

const PAGE_SIZE = 300; // GBIF max limit per request

export interface GBIFOccurrence {
  scientificName: string;
  family?: string;
  genus?: string;
  decimalLatitude: number;
  decimalLongitude: number;
  eventDate?: string;
  speciesKey?: number;
  gbifID?: number;
  datasetKey?: string;
}

export interface GBIFSpeciesDetail {
  key: number;
  scientificName: string;
  family?: string;
  genus?: string;
  canonicalName?: string;
  vernacularNames?: Array<{
    vernacularName: string;
    language: string;
  }>;
}

export interface GBIFSearchParams {
  latitude: number;
  longitude: number;
  radiusKm: number;
  language?: string; // pt, en, es, fr
  limit?: number;
  signal?: AbortSignal;
  onProgress?: (progress: SpeciesSearchProgress) => void;
}

export interface GBIFSearchResult {
  scientificName: string;
  family?: string;
  genus?: string;
  gbif_id?: string;
  commonNames: Array<{
    name: string;
    language: string;
  }>;
  coordinates: {
    lat: number;
    lng: number;
  };
  occurrenceCount: number;
}

interface GBIFBoundsQuery {
  encodedGeometry: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

function buildBoundsQuery(latitude: number, longitude: number, radiusKm: number): GBIFBoundsQuery {
  // Convert radius (km) to degrees (approximately 1 degree = 111 km at equator)
  const latOffset = radiusKm / 111;
  const lngOffset = radiusKm / (111 * Math.cos((latitude * Math.PI) / 180));

  const minLat = latitude - latOffset;
  const maxLat = latitude + latOffset;
  const minLng = longitude - lngOffset;
  const maxLng = longitude + lngOffset;

  const wktPolygon = `POLYGON((${minLng} ${minLat}, ${maxLng} ${minLat}, ${maxLng} ${maxLat}, ${minLng} ${maxLat}, ${minLng} ${minLat}))`;

  return {
    encodedGeometry: encodeURIComponent(wktPolygon),
    minLat,
    maxLat,
    minLng,
    maxLng,
  };
}

async function fetchGBIFOccurrencePage(
  bounds: GBIFBoundsQuery,
  offset: number,
  limit: number,
  signal?: AbortSignal,
): Promise<{ ok: boolean; results: any[]; count: number; endOfRecords: boolean }> {
  const url = `${GBIF_OCCURRENCE_API}?taxonKey=${PLANTAE_TAXON_KEY}&geometry=${bounds.encodedGeometry}&limit=${limit}&offset=${offset}&hasCoordinate=true`;

  let response = await fetch(url, { signal });
  let data = await response.json();

  // If geometry doesn't work, try with direct coordinates (only on first request)
  if (offset === 0 && (!response.ok || !data.results || data.count === 0)) {
    const coordUrl = `${GBIF_OCCURRENCE_API}?taxonKey=${PLANTAE_TAXON_KEY}&decimalLatitude=${bounds.minLat},${bounds.maxLat}&decimalLongitude=${bounds.minLng},${bounds.maxLng}&limit=${limit}&offset=${offset}&hasCoordinate=true`;
    response = await fetch(coordUrl, { signal });
    data = await response.json();
  }

  if (!response.ok) {
    console.error(`GBIF API error: ${response.status} ${response.statusText}`);
    return { ok: false, results: [], count: 0, endOfRecords: true };
  }

  return {
    ok: true,
    results: Array.isArray(data.results) ? data.results : [],
    count: data.count || 0,
    endOfRecords: data.endOfRecords === true,
  };
}

/**
 * Lightweight request that only fetches the total occurrence count for a search area,
 * without downloading every page of results. Used to show the user how many occurrences
 * exist before committing to the full (potentially slow) species count.
 */
export const getGBIFOccurrenceCount = async ({
  latitude,
  longitude,
  radiusKm,
  signal,
}: Pick<GBIFSearchParams, "latitude" | "longitude" | "radiusKm" | "signal">): Promise<{ totalCount: number }> => {
  const bounds = buildBoundsQuery(latitude, longitude, radiusKm);
  const page = await fetchGBIFOccurrencePage(bounds, 0, 1, signal);
  return { totalCount: page.count };
};

/**
 * Search for plant species near geographic coordinates
 * Uses GBIF occurrence search API to find ALL observations (with pagination)
 * Returns unique species sorted by occurrence count (highest first)
 */
export const searchPlantsNearby = async ({
  latitude,
  longitude,
  radiusKm,
  language = 'pt',
  signal,
  onProgress,
}: GBIFSearchParams): Promise<GBIFSearchResult[]> => {
  const bounds = buildBoundsQuery(latitude, longitude, radiusKm);

  // Fetch ALL occurrences with pagination
  let allOccurrences: any[] = [];
  let offset = 0;
  let totalCount = 0;
  let totalPages = 0;
  let hasMorePages = true;
  let currentPage = 0;

  const speciesByName = new Map<string, GBIFSearchResult & { occurrenceCount: number; speciesKey?: number }>();

  while (hasMorePages) {
    throwIfAborted(signal);
    currentPage++;

    const page = await fetchGBIFOccurrencePage(bounds, offset, PAGE_SIZE, signal);

    if (!page.ok || page.results.length === 0) {
      break;
    }

    totalCount = page.count;
    totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    allOccurrences.push(...page.results);

    // Incrementally deduplicate so the UI can show a live unique-species count
    for (const occurrence of page.results) {
      const scientificName = occurrence.scientificName?.trim();
      if (!scientificName) continue;
      if (!speciesByName.has(scientificName)) {
        speciesByName.set(scientificName, {
          scientificName,
          family: occurrence.family,
          genus: occurrence.genus,
          gbif_id: occurrence.gbifID?.toString(),
          commonNames: [],
          coordinates: {
            lat: occurrence.decimalLatitude || latitude,
            lng: occurrence.decimalLongitude || longitude,
          },
          occurrenceCount: 0,
          speciesKey: occurrence.speciesKey,
        });
      }
      speciesByName.get(scientificName)!.occurrenceCount++;
    }

    onProgress?.({
      status: 'fetching',
      currentPage,
      totalPages,
      fetchedOccurrences: allOccurrences.length,
      totalOccurrences: totalCount,
      uniqueSpecies: speciesByName.size,
    });

    if (page.endOfRecords || allOccurrences.length >= totalCount) {
      hasMorePages = false;
    } else {
      offset += PAGE_SIZE;
    }
  }

  // Enrich each unique species with common names/family/genus from the species detail endpoint.
  // Kept sequential (one request per species) to stay within GBIF's rate limits; progress is
  // reported per species so the UI doesn't look stuck once pagination has finished.
  const uniqueSpeciesList = Array.from(speciesByName.values());
  const totalSpeciesToProcess = uniqueSpeciesList.length;

  for (let i = 0; i < uniqueSpeciesList.length; i++) {
    throwIfAborted(signal);
    const species = uniqueSpeciesList[i];

    if (species.speciesKey) {
      try {
        const details = await getSpeciesDetails(species.speciesKey, language, signal);
        if (details) {
          species.commonNames = details.commonNames;
          if (details.family) species.family = details.family;
          if (details.genus) species.genus = details.genus;
        }
      } catch (error) {
        console.error(`Error fetching species details for key ${species.speciesKey}:`, error);
      }
    }

    onProgress?.({
      status: 'processing',
      currentPage,
      totalPages,
      fetchedOccurrences: allOccurrences.length,
      totalOccurrences: totalCount,
      uniqueSpecies: uniqueSpeciesList.length,
      processedSpecies: i + 1,
      totalSpeciesToProcess,
    });
  }

  // Sort by occurrence count (descending)
  const sortedResults = uniqueSpeciesList.sort((a, b) => b.occurrenceCount - a.occurrenceCount);

  onProgress?.({
    status: 'complete',
    currentPage,
    totalPages,
    fetchedOccurrences: allOccurrences.length,
    totalOccurrences: totalCount,
    uniqueSpecies: sortedResults.length,
  });

  return sortedResults;
};

/**
 * Get detailed species information including common names from GBIF
 */
const getSpeciesDetails = async (
  speciesKey: number,
  preferredLanguage: string = 'pt',
  signal?: AbortSignal,
): Promise<{ family?: string; genus?: string; commonNames: Array<{ name: string; language: string }> } | null> => {
  try {
    const response = await fetch(`${GBIF_SPECIES_API}/${speciesKey}`, { signal });

    if (!response.ok) {
      console.warn(`Could not fetch species details for key ${speciesKey}: ${response.statusText}`);
      return null;
    }

    const data = await response.json() as GBIFSpeciesDetail;

    const commonNames: Array<{ name: string; language: string }> = [];

    if (data.vernacularNames && Array.isArray(data.vernacularNames)) {
      // First add names in the preferred language
      const prefLangNames = data.vernacularNames.filter(
        v => v.language?.toLowerCase() === preferredLanguage.toLowerCase()
      );
      commonNames.push(
        ...prefLangNames.map(v => ({
          name: v.vernacularName,
          language: preferredLanguage,
        }))
      );

      // Then add other language names
      const otherNames = data.vernacularNames.filter(
        v => v.language?.toLowerCase() !== preferredLanguage.toLowerCase()
      );
      commonNames.push(
        ...otherNames.map(v => ({
          name: v.vernacularName,
          language: v.language,
        }))
      );
    }

    return {
      family: data.family,
      genus: data.genus,
      commonNames: commonNames.slice(0, 10), // Limit to 10 common names
    };
  } catch (error) {
    console.warn('Error fetching GBIF species details:', error);
    return null;
  }
};

/**
 * Search for a specific species by name to verify it exists
 * Returns first matching result with common names
 */
export const searchSpeciesByName = async (
  scientificName: string,
  language: string = 'pt'
): Promise<GBIFSearchResult | null> => {
  try {
    const params = new URLSearchParams({
      name: scientificName,
      rank: 'SPECIES',
      limit: '1',
    });


    const response = await fetch(`${GBIF_SPECIES_API}?${params}`);

    if (!response.ok) {
      console.error(`GBIF species search error: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error('Error details:', errorText);
      return null;
    }

    const data = await response.json();

    if (!data.results || !Array.isArray(data.results) || data.results.length === 0) {
      console.warn(`No species found for: ${scientificName}`);
      return null;
    }

    const species = data.results[0] as GBIFSpeciesDetail;


    return {
      scientificName: species.scientificName,
      family: species.family,
      genus: species.genus,
      gbif_id: species.key?.toString(),
      commonNames: (species.vernacularNames || [])
        .map(v => ({
          name: v.vernacularName,
          language: v.language,
        }))
        .slice(0, 10),
      coordinates: { lat: 0, lng: 0 }, // Not applicable for direct search
      occurrenceCount: 1,
    };
  } catch (error) {
    console.error('Error searching species by name:', error);
    return null;
  }
};

/**
 * Validate if a scientific name exists in GBIF database
 */
export const validateScientificName = async (scientificName: string): Promise<boolean> => {
  const result = await searchSpeciesByName(scientificName);
  return result !== null;
};
