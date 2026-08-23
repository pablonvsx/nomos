/**
 * SpeciesLink API Integration Service
 * Searches for plant species in Brazilian biodiversity network
 * Data is more robust and focused on Brazilian and South American species
 * https://specieslink.net/ws/1.0/
 */

import { SpeciesSearchProgress, throwIfAborted } from "./search-progress";

const SPECIESLINK_API = 'https://specieslink.net/ws/1.0/search';
const PAGE_SIZE = 300; // SpeciesLink max per request

export interface SpeciesLinkOccurrence {
  scientificName: string;
  family?: string;
  genus?: string;
  specificEpithet?: string;
  decimalLatitude: number;
  decimalLongitude: number;
  coordinatePrecision?: number;
  country?: string;
  stateProvince?: string;
  county?: string;
  locality?: string;
  recordedBy?: string;
  yearCollected?: number;
  identifiedBy?: string;
  yearIdentified?: number;
  basisOfRecord?: string;
  institutionCode?: string;
  collectionCode?: string;
  catalogNumber?: string;
  occurrenceRemarks?: string;
  barcode?: string;
}

export interface SpeciesLinkSearchParams {
  latitude: number;
  longitude: number;
  radiusKm: number;
  language?: string; // pt, en, es, fr
  limit?: number;
  apiKey?: string;
  signal?: AbortSignal;
  onProgress?: (progress: SpeciesSearchProgress) => void;
  scope?: 'p' | 'a' | 'b' | 'm' | 'f'; // p=plantas, a=animais, b=both, m=microorganisms, f=fossils
  withImages?: boolean;
  coordinates?: 'yes' | 'no' | 'consistent' | 'automatic' | 'suspect' | 'original';
}

export interface SpeciesLinkSearchResult {
  scientificName: string;
  family?: string;
  genus?: string;
  specificEpithet?: string;
  commonNames: Array<{
    name: string;
    language: string;
  }>;
  coordinates: {
    lat: number;
    lng: number;
  };
  occurrenceCount: number;
  source: 'specieslink';
  sourceDetails?: {
    institutionCode?: string;
    collectionCode?: string;
    recordedBy?: string;
    yearCollected?: number;
    basisOfRecord?: string;
    locality?: string;
    stateProvince?: string;
  };
}

function buildSpeciesLinkBbox(latitude: number, longitude: number, radiusKm: number): string {
  // Convert radius (km) to bounding box in degrees (1 degree ≈ 111 km at equator)
  const latOffset = radiusKm / 111;
  const lngOffset = radiusKm / (111 * Math.cos((latitude * Math.PI) / 180));

  const minLat = latitude - latOffset;
  const maxLat = latitude + latOffset;
  const minLng = longitude - lngOffset;
  const maxLng = longitude + lngOffset;

  // SpeciesLink bbox format: longitude1 latitude1 longitude2 latitude2
  return `${minLng} ${minLat} ${maxLng} ${maxLat}`;
}

function buildSpeciesLinkParams(options: {
  apiKey: string;
  bbox: string;
  offset: number;
  limit: number;
  scope: string;
  coordinates: string;
  language?: string;
  withImages?: boolean;
}): URLSearchParams {
  const params = new URLSearchParams({
    apikey: options.apiKey,
    bbox: options.bbox,
    offset: options.offset.toString(),
    limit: options.limit.toString(),
    scope: options.scope,
    coordinates: options.coordinates,
    output: 'dwc', // Darwin Core format
  });

  if (options.withImages) {
    params.append('images', 'yes');
  }

  if (options.language) {
    params.append('lang', options.language === 'pt' ? 'pt-br' : options.language);
  }

  return params;
}

/**
 * Lightweight request that only fetches the total number of matching occurrences for a
 * search area, without downloading every page. Used to show the user how many occurrences
 * exist before committing to the full species count.
 */
export const getSpeciesLinkOccurrenceCount = async ({
  latitude,
  longitude,
  radiusKm,
  apiKey,
  scope = 'p',
  coordinates = 'consistent',
  signal,
}: Pick<SpeciesLinkSearchParams, "latitude" | "longitude" | "radiusKm" | "apiKey" | "scope" | "coordinates" | "signal">): Promise<{ totalCount: number }> => {
  if (!apiKey) {
    console.warn('SpeciesLink API key not provided. Skipping count.');
    return { totalCount: 0 };
  }

  const bbox = buildSpeciesLinkBbox(latitude, longitude, radiusKm);
  const params = buildSpeciesLinkParams({ apiKey, bbox, offset: 0, limit: 1, scope, coordinates });
  const response = await fetch(`${SPECIESLINK_API}?${params}`, { signal });

  if (!response.ok) {
    console.error(`SpeciesLink API error: ${response.status} ${response.statusText}`);
    return { totalCount: 0 };
  }

  const data = await response.json();
  return { totalCount: data.numberMatched || 0 };
};

/**
 * Search for plant species near geographic coordinates in SpeciesLink
 * Returns unique species found in the region with occurrence counts
 * SpeciesLink data is more robust for Brazilian biodiversity
 */
export const searchPlantsNearbySpeciesLink = async ({
  latitude,
  longitude,
  radiusKm,
  language = 'pt',
  limit = undefined, // undefined = fetch ALL occurrences
  apiKey,
  signal,
  onProgress,
  scope = 'p', // Default to plants
  withImages = false,
  coordinates = 'consistent',
}: SpeciesLinkSearchParams): Promise<SpeciesLinkSearchResult[]> => {
  if (!apiKey) {
    console.warn('SpeciesLink API key not provided. Skipping search.');
    return [];
  }

  const bbox = buildSpeciesLinkBbox(latitude, longitude, radiusKm);

  // Fetch all occurrences with pagination (unlimited)
  let allOccurrences: SpeciesLinkOccurrence[] = [];
  let offset = 0;
  let totalCount = 0;
  let totalPages = 0;
  let hasMorePages = true;
  let currentPage = 0;

  const speciesByName = new Map<string, SpeciesLinkSearchResult>();

  while (hasMorePages && (!limit || allOccurrences.length < limit)) {
    throwIfAborted(signal);
    currentPage++;

    const params = buildSpeciesLinkParams({
      apiKey,
      bbox,
      offset,
      limit: PAGE_SIZE,
      scope,
      coordinates,
      language,
      withImages,
    });

    const response = await fetch(`${SPECIESLINK_API}?${params}`, { signal });

    if (!response.ok) {
      console.error(`SpeciesLink API error: ${response.status} ${response.statusText}`);
      break;
    }

    const data = await response.json();

    // SpeciesLink returns GeoJSON FeatureCollection
    if (!data.features || !Array.isArray(data.features) || data.features.length === 0) {
      break;
    }

    // Extract occurrence data from GeoJSON features
    const pageOccurrences: SpeciesLinkOccurrence[] = data.features.map((feature: any) => ({
      scientificName: feature.properties?.scientificName || feature.properties?.["scientificname"] || '',
      family: feature.properties?.family,
      genus: feature.properties?.genus,
      specificEpithet: feature.properties?.specificEpithet || feature.properties?.["specificepithe"],
      decimalLatitude: feature.geometry?.coordinates?.[1] || 0,
      decimalLongitude: feature.geometry?.coordinates?.[0] || 0,
      coordinatePrecision: feature.properties?.coordinatePrecision,
      country: feature.properties?.country,
      stateProvince: feature.properties?.stateProvince,
      county: feature.properties?.county,
      locality: feature.properties?.locality,
      recordedBy: feature.properties?.recordedBy,
      yearCollected: feature.properties?.yearCollected ? parseInt(feature.properties.yearCollected) : undefined,
      identifiedBy: feature.properties?.identifiedBy,
      yearIdentified: feature.properties?.yearIdentified ? parseInt(feature.properties.yearIdentified) : undefined,
      basisOfRecord: feature.properties?.basisOfRecord,
      institutionCode: feature.properties?.institutionCode,
      collectionCode: feature.properties?.collectionCode,
      catalogNumber: feature.properties?.catalogNumber,
      occurrenceRemarks: feature.properties?.occurrenceRemarks,
      barcode: feature.properties?.barcode,
    }));

    allOccurrences.push(...pageOccurrences);
    totalCount = data.numberMatched || allOccurrences.length;
    totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

    // Incrementally deduplicate so the UI can show a live unique-species count
    for (const occurrence of pageOccurrences) {
      const scientificName = occurrence.scientificName?.trim();
      if (!scientificName) continue;

      if (!speciesByName.has(scientificName)) {
        speciesByName.set(scientificName, {
          scientificName,
          family: occurrence.family,
          genus: occurrence.genus,
          specificEpithet: occurrence.specificEpithet,
          commonNames: [],
          coordinates: {
            lat: occurrence.decimalLatitude || latitude,
            lng: occurrence.decimalLongitude || longitude,
          },
          occurrenceCount: 0,
          source: 'specieslink',
          sourceDetails: {
            institutionCode: occurrence.institutionCode,
            collectionCode: occurrence.collectionCode,
            recordedBy: occurrence.recordedBy,
            yearCollected: occurrence.yearCollected,
            basisOfRecord: occurrence.basisOfRecord,
            locality: occurrence.locality,
            stateProvince: occurrence.stateProvince,
          },
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

    // Check if there are more pages
    if (data.numberReturned < PAGE_SIZE || (limit !== undefined && allOccurrences.length >= limit)) {
      hasMorePages = false;
    } else {
      offset += PAGE_SIZE;
    }
  }

  // Sort by occurrence count (descending)
  const sortedResults = Array.from(speciesByName.values()).sort(
    (a, b) => b.occurrenceCount - a.occurrenceCount
  );

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
 * Search for a specific species by name in SpeciesLink
 * Returns first matching result with metadata
 */
export const searchSpeciesByNameSpeciesLink = async (
  scientificName: string,
  apiKey?: string,
  language: string = 'pt'
): Promise<SpeciesLinkSearchResult | null> => {
  try {
    if (!apiKey) {
      console.warn('⚠️ SpeciesLink API key not provided. Skipping search.');
      return null;
    }

    const params = new URLSearchParams({
      apikey: apiKey,
      scientificname: scientificName,
      scope: 'p', // Plants only
      output: 'dwc',
      limit: '1',
    });

    if (language) {
      params.append('lang', language === 'pt' ? 'pt-br' : language);
    }


    const response = await fetch(`${SPECIESLINK_API}?${params}`);

    if (!response.ok) {
      console.error(`SpeciesLink species search error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();

    if (!data.features || !Array.isArray(data.features) || data.features.length === 0) {
      console.warn(`No species found in SpeciesLink for: ${scientificName}`);
      return null;
    }

    const feature = data.features[0];
    const props = feature.properties;


    return {
      scientificName: props.scientificName,
      family: props.family,
      genus: props.genus,
      specificEpithet: props.specificEpithet,
      commonNames: [],
      coordinates: {
        lat: feature.geometry?.coordinates?.[1] || 0,
        lng: feature.geometry?.coordinates?.[0] || 0,
      },
      occurrenceCount: 1,
      source: 'specieslink',
      sourceDetails: {
        institutionCode: props.institutionCode,
        collectionCode: props.collectionCode,
        recordedBy: props.recordedBy,
        yearCollected: props.yearCollected ? parseInt(props.yearCollected) : undefined,
        basisOfRecord: props.basisOfRecord,
        locality: props.locality,
        stateProvince: props.stateProvince,
      },
    };
  } catch (error) {
    console.error('Error searching species by name in SpeciesLink:', error);
    return null;
  }
};

/**
 * Validate if a scientific name exists in SpeciesLink database
 */
export const validateScientificNameSpeciesLink = async (
  scientificName: string,
  apiKey?: string
): Promise<boolean> => {
  const result = await searchSpeciesByNameSpeciesLink(scientificName, apiKey);
  return result !== null;
};

export type SpeciesLinkApiKeyValidation =
  | { valid: true }
  | { valid: false; reason: 'invalid_key' | 'rate_limited' | 'network_error' };

/**
 * Checks an API key directly against the SpeciesLink search endpoint,
 * inspecting the HTTP status so an invalid key (401/403) can be told
 * apart from a rate limit (429) or a query with no matching species.
 */
export const checkSpeciesLinkApiKeyValidity = async (
  apiKey: string
): Promise<SpeciesLinkApiKeyValidation> => {
  try {
    const params = new URLSearchParams({
      apikey: apiKey,
      scientificname: 'Araucaria angustifolia',
      scope: 'p',
      output: 'dwc',
      limit: '1',
    });

    const response = await fetch(`${SPECIESLINK_API}?${params}`);

    if (response.status === 401 || response.status === 403) {
      return { valid: false, reason: 'invalid_key' };
    }
    if (response.status === 429) {
      return { valid: false, reason: 'rate_limited' };
    }
    if (!response.ok) {
      return { valid: false, reason: 'network_error' };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: 'network_error' };
  }
};

/**
 * Combine GBIF and SpeciesLink results, prioritizing SpeciesLink for Brazilian data
 * Deduplicates results and returns unified format
 */
export const searchPlantsNearbyBothSources = async ({
  latitude,
  longitude,
  radiusKm,
  language = 'pt',
  limit = 500,
  gbifResults = false,
  speciesLinkResults = true,
  speciesLinkApiKey,
  onProgress,
}: {
  latitude: number;
  longitude: number;
  radiusKm: number;
  language?: string;
  limit?: number;
  gbifResults?: boolean;
  speciesLinkResults?: boolean;
  speciesLinkApiKey?: string;
  onProgress?: (progress: { source: string; status: string }) => void;
}): Promise<
  Array<{
    scientificName: string;
    family?: string;
    genus?: string;
    commonNames: Array<{ name: string; language: string }>;
    coordinates: { lat: number; lng: number };
    occurrenceCount: number;
    sources: Array<'gbif' | 'specieslink'>;
  }>
> => {
  const allResults = new Map<
    string,
    {
      scientificName: string;
      family?: string;
      genus?: string;
      commonNames: Array<{ name: string; language: string }>;
      coordinates: { lat: number; lng: number };
      occurrenceCount: number;
      sources: Array<'gbif' | 'specieslink'>;
    }
  >();

  // Search SpeciesLink if enabled (prioritize for Brazilian data)
  if (speciesLinkResults && speciesLinkApiKey) {
    if (onProgress) onProgress({ source: 'specieslink', status: 'searching' });

    const slResults = await searchPlantsNearbySpeciesLink({
      latitude,
      longitude,
      radiusKm,
      language,
      limit,
      apiKey: speciesLinkApiKey,
    });

    for (const result of slResults) {
      const key = result.scientificName.toLowerCase();
      allResults.set(key, {
        scientificName: result.scientificName,
        family: result.family,
        genus: result.genus,
        commonNames: result.commonNames,
        coordinates: result.coordinates,
        occurrenceCount: result.occurrenceCount,
        sources: ['specieslink'],
      });
    }

  }

  // Search GBIF if enabled (for global data)
  if (gbifResults) {
    if (onProgress) onProgress({ source: 'gbif', status: 'searching' });

    // Note: This requires GBIF integration to be available
    // For now, just log that it would be called
  }

  // Return combined and deduplicated results
  const combinedResults = Array.from(allResults.values()).sort(
    (a, b) => b.occurrenceCount - a.occurrenceCount
  );


  return combinedResults;
};
