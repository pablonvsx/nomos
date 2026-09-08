import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, StyleSheet, ActivityIndicator, InteractionManager, Platform } from 'react-native';
import MapView, { Marker, MapType, Geojson, Region } from 'react-native-maps';
import { ErrorBoundaryThemed as ErrorBoundary } from '@/components/ErrorBoundary';
import { useLocalSearchParams, Stack } from 'expo-router';
import { FAB, useTheme as usePaperTheme, IconButton, Banner, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomContentPadding } from '@/hooks/use-bottom-content-padding';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';
import Constants from 'expo-constants';

import { getProjectById } from '@/db/queries/projects';
import { getPointsByProject } from '@/db/queries/points';
import { getProjectMembers } from '@/db/queries/project-members';
import { getPointDisplayLabel, toMemberLiteList } from '@/core/drive-sync/point-label';
import { Project, Point, ProjectMember } from '@/types/database';
import { useI18n } from '@/contexts/i18n-context';
import { useMapData } from '@/contexts/map-data-context';
import { useAlertDialog } from '@/hooks/use-dialog';
import { MapLegend } from '@/components/map/MapLegend';
import { LayerMenu } from '@/components/map/LayerMenu';
import { useLocationPermission } from '@/hooks/use-location-permission';
import { MAP_OVERLAY_MARGIN, MAP_OVERLAY_BUTTON_GAP, MAP_LEGEND_TOP_OFFSET } from '@/components/map/map-overlay-styles';

// --- Interfaces ---
interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: any[];
}

// --- Main component ---

function ViewMapScreen() {
  const { projectId, highlightSurveyPointId } = useLocalSearchParams<{ projectId: string; highlightSurveyPointId?: string; }>();
  const { t } = useI18n();
  const { alert } = useAlertDialog();
  const { getMapData, setMapData, loadGeoJSONFile, calculateBoundingBox } = useMapData();
  const theme = usePaperTheme();
  const insets = useSafeAreaInsets();
  const fabBottomPadding = useBottomContentPadding();
  const layerMenuBottomOffset = useBottomContentPadding(74);

  const mapRef = useRef<MapView>(null);
  const loadedRef = useRef(false);
  const { status: locationPermissionStatus, ensurePermission: ensureLocationPermission } = useLocationPermission();

  // Data state
  const [project, setProject] = useState<Project | null>(null);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [surveyPoints, setSurveyPoints] = useState<Point[]>([]);
  const [layerData, setLayerData] = useState<GeoJSONFeatureCollection | null>(null);
  const [routeData, setRouteData] = useState<GeoJSONFeatureCollection | null>(null);
  
  // UI state
  const [isLoading, setIsLoading] = useState(true);
  const [mapType, setMapType] = useState<MapType>('hybrid');
  const [menuVisible, setMenuVisible] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [legendVisible, setLegendVisible] = useState(true);
  const [shouldRenderContent, setShouldRenderContent] = useState(false);
  const [initialRegion, setInitialRegion] = useState<Region | undefined>(undefined);
  const googleMapsConfigured = Boolean(
    (Constants.expoConfig?.extra as Record<string, unknown> | undefined)
      ?.googleMapsConfigured,
  );
  const shouldBlockMapRender =
    Platform.OS === 'android' && !__DEV__ && !googleMapsConfigured;

  useEffect(() => {
    if (Platform.OS === 'ios' && mapType === 'terrain') {
      setMapType('standard');
    }
  }, [mapType]);

  // Requests location permission as soon as the map screen opens, so
  // showsUserLocation and the GPS button work without waiting for a tap.
  useEffect(() => {
    ensureLocationPermission();
  }, [ensureLocationPermission]);

  // Helper to calculate map region from a bounding box
  const getRegionFromBBox = useCallback((bbox: any) => {
    if (!bbox) return undefined;
    const { minLat, maxLat, minLon, maxLon } = bbox;
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.3, 0.01),
      longitudeDelta: Math.max((maxLon - minLon) * 1.3, 0.01),
    };
  }, []);

  // Loads all map data (unified effect)
  useEffect(() => {
    if (!projectId || loadedRef.current) return;
    loadedRef.current = true;
    let mounted = true;

    const init = async () => {
      try {
        const id = parseInt(projectId);
        
        // 1. Try cache
        const cached = getMapData(id);
        
        // 2. Prepare fresh data promises if cache miss
        let dataPromises: Promise<any>[] = [];
        
        if (!cached) {
          const projPromise = getProjectById(id);
          dataPromises.push(projPromise); // Index 0
          // The others depend on the project, so chain them after
        } else {
          const cachedProj = await getProjectById(id); // Cache holds heavy data, but the project entity is lightweight
          setProject(cachedProj);
          if (cachedProj?.is_collaborative) {
            try {
              setProjectMembers(await getProjectMembers(id));
            } catch (membersError) {
              console.error('Error loading project members:', membersError);
              setProjectMembers([]);
            }
          } else {
            setProjectMembers([]);
          }
        }

        // Fetches user location in parallel (permission was already requested on mount)
        const userLocPromise = (async () => {
            try {
              const granted = await ensureLocationPermission();
              if (granted) return await Location.getCurrentPositionAsync({});
            } catch {}
            return null;
        })();

        // --- Loading Logic ---
        let finalLayer, finalRoute, finalPoints, finalBBox;

        if (cached) {
          // Cache hit
          finalLayer = cached.layerData;
          finalRoute = cached.routeData;
          finalPoints = cached.surveyPoints;
          finalBBox = cached.boundingBox;
          
          if (finalBBox) setInitialRegion(getRegionFromBBox(finalBBox));
          setIsLoading(false); // Release UI quickly
        } else {
          // Cache miss - load all data fresh
          const proj = await getProjectById(id);
          if (!proj) {
            if (mounted) {
              alert(t('common.error'), t('projectView.projectNotFound'));
              setIsLoading(false);
            }
            return;
          }
          setProject(proj);

          if (proj.is_collaborative) {
            try {
              setProjectMembers(await getProjectMembers(id));
            } catch (membersError) {
              console.error('Error loading project members:', membersError);
              setProjectMembers([]);
            }
          } else {
            setProjectMembers([]);
          }

          const [points, layer, route] = await Promise.all([
             getPointsByProject(id),
             proj.geojson_layer ? loadGeoJSONFile(proj.geojson_layer) : Promise.resolve(null),
             proj.geojson_field_route ? loadGeoJSONFile(proj.geojson_field_route) : Promise.resolve(null)
          ]);

          finalPoints = points;
          finalLayer = layer;
          finalRoute = route;
          finalBBox = calculateBoundingBox(layer, route, points);

          if (finalBBox) setInitialRegion(getRegionFromBBox(finalBBox));
          setIsLoading(false);
          
          // Save to cache for the next access
          setMapData(id, {
            layerData: layer,
            routeData: route,
            surveyPoints: points,
            boundingBox: finalBBox,
          });
        }

        // Defer heavy rendering until after interactions
        InteractionManager.runAfterInteractions(() => {
          if (!mounted) return;
          setLayerData(finalLayer as any);
          setRouteData(finalRoute as any);
          setSurveyPoints(finalPoints);
          setShouldRenderContent(true);

          // Final zoom adjustments (highlight a specific point or fit bounding box)
          setTimeout(async () => {
             if (!mounted || !mapRef.current) return;

             // Priority 1: Highlight Point
             if (highlightSurveyPointId && finalPoints.length > 0) {
               const p = finalPoints.find((x: Point) => x.id === highlightSurveyPointId);
               if (p) {
                 mapRef.current.animateToRegion({
                   latitude: p.lat, longitude: p.lon,
                   latitudeDelta: 0.005, longitudeDelta: 0.005
                 }, 1000);
                 return;
               }
             }

             // Priority 2: Bounding Box (if initialRegion was not set, ensure correct zoom)
             // If initialRegion was set, the map starts there; only animate again to include user location
             const userLoc = await userLocPromise;
             if (finalBBox && userLoc) {
                // Optionally recalculate region to include the user's location
             }
          }, 500);
        });

      } catch (e) {
        console.error(e);
        if (mounted) setIsLoading(false);
      }
    };

    init();
    
    // NetInfo listener
    const unsubNet = NetInfo.addEventListener(s => mounted && setIsOffline(!s.isConnected));
    
    return () => { mounted = false; unsubNet(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Handlers
  const handleZoomToUser = async () => {
    try {
      const granted = await ensureLocationPermission();
      if (!granted) {
        alert(t('common.error'), t('mapView.locationPermissionDenied'));
        return;
      }

      const loc = await Location.getCurrentPositionAsync({});
      mapRef.current?.animateToRegion({
        latitude: loc.coords.latitude, longitude: loc.coords.longitude,
        latitudeDelta: 0.01, longitudeDelta: 0.01
      }, 1000);
    } catch {
      alert(t('common.error'), t('mapView.locationError'));
    }
  };

  const handleZoomToLayer = useCallback(() => {
    if (!layerData?.features || !mapRef.current) return;
    const bbox = calculateBoundingBox(layerData, null, []);
    if (bbox) {
      const region = getRegionFromBBox(bbox);
      if (region) mapRef.current.animateToRegion(region, 1000);
    }
  }, [layerData, calculateBoundingBox, getRegionFromBBox]);

  const handleZoomToRoute = useCallback(() => {
    if (!routeData?.features || !mapRef.current) return;
    const bbox = calculateBoundingBox(null, routeData, []);
    if (bbox) {
      const region = getRegionFromBBox(bbox);
      if (region) mapRef.current.animateToRegion(region, 1000);
    }
  }, [routeData, calculateBoundingBox, getRegionFromBBox]);

  // Memoized renders
  const renderedMarkers = useMemo(() => {
    if (!shouldRenderContent || !surveyPoints.length) return null;
    const membersLite = toMemberLiteList(projectMembers);
    return surveyPoints.map(p => {
      const isHigh = highlightSurveyPointId && p.id === highlightSurveyPointId;
      const pointDisplayLabel = getPointDisplayLabel(
        { pointNumber: p.point_number, createdBy: p.created_by ?? null },
        Boolean(project?.is_collaborative),
        membersLite,
      );
      return (
        <Marker
          key={`p-${p.id}`}
          coordinate={{ latitude: p.lat, longitude: p.lon }}
          title={p.generated_name || `${t('common.point')} ${pointDisplayLabel}`}
          pinColor={isHigh ? '#00C853' : '#FFD700'}
          tracksViewChanges={false} // Critical performance: prevents unnecessary re-renders
        />
      );
    });
  }, [surveyPoints, shouldRenderContent, highlightSurveyPointId, t, projectMembers, project]);

  if (isLoading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={theme.colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: project?.name || t('mapView.title'), headerShown: true }} />
      
      {isOffline && <Banner visible icon="wifi-off">{t('common.offline')}</Banner>}

      {shouldBlockMapRender ? (
        <View
          style={[
            styles.mapFallback,
            { backgroundColor: theme.colors.background },
          ]}
        >
          <Text variant="titleMedium" style={{ color: theme.colors.error }}>
            {t('common.error')}
          </Text>
          <Text
            variant="bodyMedium"
            style={[styles.mapFallbackText, { color: theme.colors.onSurface }]}
          >
            Google Maps API key is not configured in this build profile. Configure
            GOOGLE_MAPS_API_KEY on EAS environment and generate a new APK.
          </Text>
        </View>
      ) : (
        <MapView
          ref={mapRef}
          style={styles.map}
          mapType={mapType}
          initialRegion={initialRegion}
          showsUserLocation={locationPermissionStatus === 'granted'}
          showsMyLocationButton={false}
          showsCompass
          loadingEnabled
        >
          {shouldRenderContent && layerData && (
            <Geojson geojson={layerData} strokeColor="#4A90E2" strokeWidth={2} fillColor="transparent" />
          )}
          {shouldRenderContent && routeData && (
            <Geojson geojson={routeData} strokeColor="#FF0000" strokeWidth={3} />
          )}
          {renderedMarkers}
        </MapView>
      )}

      {/* --- Floating Controls --- */}

      {/* Legend button (visible when legend is closed) */}
      {!shouldBlockMapRender && !legendVisible && (
        <IconButton
          icon="map-legend"
          size={24}
          iconColor={theme.colors.primary}
          containerColor={theme.colors.surface}
          style={[styles.floatBtn, { top: insets.top + MAP_LEGEND_TOP_OFFSET, left: MAP_OVERLAY_MARGIN }]}
          onPress={() => setLegendVisible(true)}
        />
      )}

      {/* Legend component */}
      <MapLegend
        visible={!shouldBlockMapRender && legendVisible}
        onClose={() => setLegendVisible(false)}
        hasLayer={!!layerData}
        hasRoute={!!routeData}
        pointsCount={surveyPoints.length}
        hasCurrentPoint={!!highlightSurveyPointId}
        topOffset={insets.top + MAP_LEGEND_TOP_OFFSET}
        t={t}
        theme={theme}
      />

      {/* Layers button */}
      {!shouldBlockMapRender && (
        <View style={[styles.fabContainer, { bottom: fabBottomPadding }]}>
          <FAB
            icon="layers"
            onPress={() => setMenuVisible(!menuVisible)}
            style={[styles.fab, { backgroundColor: theme.colors.surface }]}
            color={theme.colors.primary}
          />
        </View>
      )}

      {/* Layers menu component */}
      <LayerMenu
        visible={!shouldBlockMapRender && menuVisible}
        onClose={() => setMenuVisible(false)}
        mapType={mapType}
        setMapType={setMapType}
        bottomOffset={layerMenuBottomOffset}
        t={t}
        theme={theme}
      />

      {/* GPS zoom button */}
      {!shouldBlockMapRender && (
        <IconButton
          icon="crosshairs-gps"
          size={24}
          iconColor={theme.colors.primary}
          containerColor={theme.colors.surface}
          style={[styles.floatBtn, { top: insets.top + 10, right: MAP_OVERLAY_MARGIN }]}
          onPress={handleZoomToUser}
        />
      )}

      {/* Zoom to the project's map/layer feature (geojson_layer) */}
      {!shouldBlockMapRender && layerData && (
        <IconButton
          icon="map"
          size={24}
          iconColor={theme.colors.primary}
          containerColor={theme.colors.surface}
          style={[styles.floatBtn, { top: insets.top + 10 + MAP_OVERLAY_BUTTON_GAP, right: MAP_OVERLAY_MARGIN }]}
          onPress={handleZoomToLayer}
        />
      )}

      {/* Zoom to the project's field route (geojson_field_route) */}
      {!shouldBlockMapRender && routeData && (
        <IconButton
          icon="routes"
          size={24}
          iconColor={theme.colors.primary}
          containerColor={theme.colors.surface}
          style={[styles.floatBtn, { top: insets.top + 10 + 2 * MAP_OVERLAY_BUTTON_GAP, right: MAP_OVERLAY_MARGIN }]}
          onPress={handleZoomToRoute}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  map: { flex: 1 },
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  mapFallbackText: {
    marginTop: 8,
    textAlign: 'center',
    maxWidth: 420,
  },
  fabContainer: { position: 'absolute', right: 16 },
  fab: { elevation: 4 },
  floatBtn: { position: 'absolute', elevation: 4 },
});

export default function WrappedViewMapScreen() {
  return (
    <ErrorBoundary>
      <ViewMapScreen />
    </ErrorBoundary>
  );
}