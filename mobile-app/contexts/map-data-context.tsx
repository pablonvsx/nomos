// src/contexts/map-data-context.tsx
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { File } from "expo-file-system";
import { Point } from "@/types/database";

interface GeoJSONFeature {
  type: string;
  geometry: {
    type: string;
    coordinates: any;
  };
  properties?: any;
}

interface GeoJSONFeatureCollection {
  type: string;
  features: GeoJSONFeature[];
}

interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

interface MapData {
  projectId: number;
  layerData: GeoJSONFeatureCollection | null;
  routeData: GeoJSONFeatureCollection | null;
  surveyPoints: Point[];
  boundingBox: BoundingBox | null;
  timestamp: number;
}

interface MapDataContextType {
  getMapData: (projectId: number) => MapData | null;
  setMapData: (
    projectId: number,
    data: Omit<MapData, "projectId" | "timestamp">,
  ) => void;
  clearMapData: (projectId?: number) => void;
  loadGeoJSONFile: (
    filePath: string,
  ) => Promise<GeoJSONFeatureCollection | null>;
  calculateBoundingBox: (
    layerData: GeoJSONFeatureCollection | null,
    routeData: GeoJSONFeatureCollection | null,
    surveyPoints: Point[],
  ) => BoundingBox | null;
}

const MapDataContext = createContext<MapDataContextType | undefined>(undefined);

// Cache duration: 5 minutes
const CACHE_DURATION = 5 * 60 * 1000;

export function MapDataProvider({ children }: { children: ReactNode }) {
  const [cache, setCache] = useState<Map<number, MapData>>(new Map());

  const loadGeoJSONFile = useCallback(
    async (filePath: string): Promise<GeoJSONFeatureCollection | null> => {
      try {
        const file = new File(filePath);
        if (file.exists) {
          const content = await file.text();
          return JSON.parse(content);
        }
        return null;
      } catch (error) {
        console.error("Error loading GeoJSON file:", error);
        return null;
      }
    },
    [],
  );

  const getMapData = useCallback(
    (projectId: number): MapData | null => {
      const data = cache.get(projectId);
      if (data && Date.now() - data.timestamp < CACHE_DURATION) {
        return data;
      }
      return null;
    },
    [cache],
  );

  const setMapData = useCallback(
    (projectId: number, data: Omit<MapData, "projectId" | "timestamp">) => {
      setCache((prev) => {
        const newCache = new Map(prev);
        newCache.set(projectId, {
          projectId,
          ...data,
          timestamp: Date.now(),
        });
        return newCache;
      });
    },
    [],
  );

  const clearMapData = useCallback((projectId?: number) => {
    if (projectId !== undefined) {
      setCache((prev) => {
        const newCache = new Map(prev);
        newCache.delete(projectId);
        return newCache;
      });
    } else {
      setCache(new Map());
    }
  }, []);

  const calculateBoundingBox = useCallback(
    (
      layerData: GeoJSONFeatureCollection | null,
      routeData: GeoJSONFeatureCollection | null,
      surveyPoints: Point[],
    ): BoundingBox | null => {
      let minLat = Infinity;
      let maxLat = -Infinity;
      let minLon = Infinity;
      let maxLon = -Infinity;
      let hasCoords = false;

      // Process layer data
      if (layerData?.features) {
        layerData.features.forEach((feature) => {
          if (feature.geometry.type === "Polygon") {
            feature.geometry.coordinates[0].forEach((coord: number[]) => {
              minLon = Math.min(minLon, coord[0]);
              maxLon = Math.max(maxLon, coord[0]);
              minLat = Math.min(minLat, coord[1]);
              maxLat = Math.max(maxLat, coord[1]);
              hasCoords = true;
            });
          } else if (feature.geometry.type === "MultiPolygon") {
            feature.geometry.coordinates.forEach((polygon: number[][][]) => {
              polygon[0].forEach((coord: number[]) => {
                minLon = Math.min(minLon, coord[0]);
                maxLon = Math.max(maxLon, coord[0]);
                minLat = Math.min(minLat, coord[1]);
                maxLat = Math.max(maxLat, coord[1]);
                hasCoords = true;
              });
            });
          }
        });
      }

      // Process route data
      if (routeData?.features) {
        routeData.features.forEach((feature) => {
          if (feature.geometry.type === "LineString") {
            feature.geometry.coordinates.forEach((coord: number[]) => {
              minLon = Math.min(minLon, coord[0]);
              maxLon = Math.max(maxLon, coord[0]);
              minLat = Math.min(minLat, coord[1]);
              maxLat = Math.max(maxLat, coord[1]);
              hasCoords = true;
            });
          } else if (feature.geometry.type === "MultiLineString") {
            feature.geometry.coordinates.forEach((line: number[][]) => {
              line.forEach((coord: number[]) => {
                minLon = Math.min(minLon, coord[0]);
                maxLon = Math.max(maxLon, coord[0]);
                minLat = Math.min(minLat, coord[1]);
                maxLat = Math.max(maxLat, coord[1]);
                hasCoords = true;
              });
            });
          }
        });
      }

      // Process survey points
      surveyPoints.forEach((point) => {
        minLon = Math.min(minLon, point.lon);
        maxLon = Math.max(maxLon, point.lon);
        minLat = Math.min(minLat, point.lat);
        maxLat = Math.max(maxLat, point.lat);
        hasCoords = true;
      });

      if (!hasCoords) {
        return null;
      }

      return { minLat, maxLat, minLon, maxLon };
    },
    [],
  );

  return (
    <MapDataContext.Provider
      value={{
        getMapData,
        setMapData,
        clearMapData,
        loadGeoJSONFile,
        calculateBoundingBox,
      }}
    >
      {children}
    </MapDataContext.Provider>
  );
}

export function useMapData() {
  const context = useContext(MapDataContext);
  if (!context) {
    throw new Error("useMapData must be used within a MapDataProvider");
  }
  return context;
}
