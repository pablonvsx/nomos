import React, { useState, useEffect, useRef, useMemo } from "react";
import { View, StyleSheet, Modal, InteractionManager, Platform } from "react-native";
import { Button, IconButton, Text, FAB, useTheme } from "react-native-paper";
import MapView, {
  Marker,
  Geojson,
  MapType,
  Region,
} from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { useI18n } from "@/contexts/i18n-context";
import Constants from "expo-constants";
import {
  MAP_OVERLAY_MARGIN,
  MAP_OVERLAY_BUTTON_GAP,
  MAP_OVERLAY_SHADOW,
  MAP_LEGEND_TOP_OFFSET,
} from "@/components/map/map-overlay-styles";
import { LayerMenu } from "@/components/map/LayerMenu";
import { BUTTON_RADIUS } from "@/constants/shape";
import { useLocationPermission } from "@/hooks/use-location-permission";

// This modal already has its own header above the map (unlike the project
// map view screen), so its legend needs a bit more clearance than
// MAP_LEGEND_TOP_OFFSET to fully clear the native Google Maps compass.
const MODAL_LEGEND_TOP_OFFSET = MAP_LEGEND_TOP_OFFSET + 24;

interface LocationPickerModalProps {
  visible: boolean;
  onDismiss: () => void;
  onConfirm: (coords: { latitude: number; longitude: number }) => void;
  initialCoordinate?: { latitude: number; longitude: number };
  mapData: {
    layerData: any;
    routeData: any;
    surveyPoints: any[];
  };
}

export function LocationPickerModal({
  visible,
  onDismiss,
  onConfirm,
  initialCoordinate,
  mapData,
}: LocationPickerModalProps) {
  const theme = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const { status: locationPermissionStatus, ensurePermission: ensureLocationPermission } = useLocationPermission();

  // Local state
  const [tempMarker, setTempMarker] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [mapType, setMapType] = useState<MapType>("hybrid");
  const [menuVisible, setMenuVisible] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
  const [initialRegion, setInitialRegion] = useState<Region | undefined>(
    undefined,
  );
  const [legendVisible, setLegendVisible] = useState(true);
  const googleMapsConfigured = Boolean(
    (Constants.expoConfig?.extra as Record<string, unknown> | undefined)
      ?.googleMapsConfigured,
  );
  const shouldBlockMapRender =
    Platform.OS === "android" && !__DEV__ && !googleMapsConfigured;

  useEffect(() => {
    if (Platform.OS === "ios" && mapType === "terrain") {
      setMapType("standard");
    }
  }, [mapType]);

  // Synchronizes the initial marker and gets user location when the modal opens
  useEffect(() => {
    if (visible) {
      // If initial coordinates are provided, use them
      if (initialCoordinate) {
        setTempMarker(initialCoordinate);
        setInitialRegion({
          ...initialCoordinate,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        });
      } else {
        // Otherwise, try to get the device's current location (requesting
        // permission first, since opening the modal is the user's first
        // contact with this map, not just the GPS button)
        ensureLocationPermission()
          .then((granted) => {
            if (!granted) throw new Error("Permission denied");
            return Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
          })
          .then((loc) => {
            const region = {
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
              latitudeDelta: 0.005,
              longitudeDelta: 0.005,
            };
            setInitialRegion(region);
            // Center the map on the user's current location
            if (mapRef.current) {
              mapRef.current.animateToRegion(region, 500);
            }
          })
          .catch(() => {
            // On failure, fall back to a default region (central Brazil)
            setInitialRegion({
              latitude: -15.7801,
              longitude: -47.9292,
              latitudeDelta: 0.005,
              longitudeDelta: 0.005,
            });
          });
      }
    }
  }, [visible, initialCoordinate, ensureLocationPermission]);

  // Delays heavy rendering of the map content to smooth the Modal animation
  useEffect(() => {
    if (visible) {
      const task = InteractionManager.runAfterInteractions(() => {
        setIsMapReady(true);
      });
      return () => task.cancel();
    } else {
      setIsMapReady(false);
    }
  }, [visible]);

  // Memoization of Layers to avoid re-processing
  const renderedLayers = useMemo(() => {
    if (!isMapReady) return null;
    return (
      <>
        {mapData.layerData && (
          <Geojson
            geojson={mapData.layerData}
            strokeColor="#4A90E2"
            fillColor="rgba(74, 144, 226, 0.2)"
            strokeWidth={2}
          />
        )}
        {mapData.routeData && (
          <Geojson
            geojson={mapData.routeData}
            strokeColor="#FF0000"
            strokeWidth={3}
          />
        )}
        {mapData.surveyPoints.map((point: any) => (
          <Marker
            key={point.id}
            coordinate={{
              latitude: point.lat,
              longitude: point.lon,
            }}
            pinColor="#FFD700"
            tracksViewChanges={false} // Critical performance
          />
        ))}
      </>
    );
  }, [isMapReady, mapData]);

  const handleConfirm = () => {
    if (tempMarker) onConfirm(tempMarker);
  };

  const handleZoomToUser = async () => {
    try {
      const granted = await ensureLocationPermission();
      if (!granted) return;

      const loc = await Location.getCurrentPositionAsync({});
      mapRef.current?.animateToRegion(
        {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        },
        1000,
      );
    } catch (error) {
      console.error("Error fetching current location:", error);
    }
  };

  const handleZoomToLayer = () => {
    if (!mapData.layerData?.features || !mapRef.current) return;

    // Extract all layer/map polygon coordinates
    const allCoords: number[][] = [];
    mapData.layerData.features.forEach((feature: any) => {
      if (feature.geometry?.type === "Polygon") {
        feature.geometry.coordinates[0].forEach((coord: number[]) =>
          allCoords.push(coord),
        );
      } else if (feature.geometry?.type === "MultiPolygon") {
        feature.geometry.coordinates.forEach((polygon: number[][][]) =>
          polygon[0].forEach((coord: number[]) => allCoords.push(coord)),
        );
      }
    });

    if (allCoords.length === 0) return;

    // Compute the layer bounding box
    const lons = allCoords.map((c) => c[0]);
    const lats = allCoords.map((c) => c[1]);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);

    const centerLat = (minLat + maxLat) / 2;
    const centerLon = (minLon + maxLon) / 2;
    const latDelta = (maxLat - minLat) * 1.2; // 20% padding
    const lonDelta = (maxLon - minLon) * 1.2;

    mapRef.current.animateToRegion(
      {
        latitude: centerLat,
        longitude: centerLon,
        latitudeDelta: Math.max(latDelta, 0.005),
        longitudeDelta: Math.max(lonDelta, 0.005),
      },
      1000,
    );
  };

  const handleZoomToRoute = () => {
    if (!mapData.routeData?.features || !mapRef.current) return;

    // Extract all route coordinates
    const allCoords: number[][] = [];
    mapData.routeData.features.forEach((feature: any) => {
      if (feature.geometry?.type === "LineString") {
        allCoords.push(...feature.geometry.coordinates);
      } else if (feature.geometry?.type === "MultiLineString") {
        feature.geometry.coordinates.forEach((line: number[][]) =>
          allCoords.push(...line),
        );
      }
    });

    if (allCoords.length === 0) return;

    // Compute the route bounding box
    const lons = allCoords.map((c) => c[0]);
    const lats = allCoords.map((c) => c[1]);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);

    const centerLat = (minLat + maxLat) / 2;
    const centerLon = (minLon + maxLon) / 2;
    const latDelta = (maxLat - minLat) * 1.2; // 20% padding
    const lonDelta = (maxLon - minLon) * 1.2;

    mapRef.current.animateToRegion(
      {
        latitude: centerLat,
        longitude: centerLon,
        latitudeDelta: Math.max(latDelta, 0.005),
        longitudeDelta: Math.max(lonDelta, 0.005),
      },
      1000,
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onDismiss}>
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        {/* Header */}
        <View
          style={[
            styles.header,
            { marginTop: insets.top, backgroundColor: theme.colors.surface },
          ]}
        >
          <IconButton
            icon="close"
            onPress={onDismiss}
            iconColor={theme.colors.onSurface}
          />
          <Text
            variant="titleMedium"
            style={{ flex: 1, color: theme.colors.onSurface }}
          >
            {t("insertLocation.selectLocation")}
          </Text>
          <Button
            mode="contained"
            onPress={handleConfirm}
            disabled={!tempMarker}
            compact
            style={{ borderRadius: BUTTON_RADIUS }}
          >
            {t("common.confirm")}
          </Button>
        </View>

        {/* Map */}
        <View style={styles.mapContainer}>
          {shouldBlockMapRender ? (
            <View
              style={[
                styles.mapFallback,
                { backgroundColor: theme.colors.background },
              ]}
            >
              <Text variant="titleMedium" style={{ color: theme.colors.error }}>
                {t("common.error")}
              </Text>
              <Text
                variant="bodyMedium"
                style={[styles.mapFallbackText, { color: theme.colors.onSurface }]}
              >
                Google Maps API key is not configured in this build profile.
                Configure GOOGLE_MAPS_API_KEY on EAS and generate a new APK.
              </Text>
            </View>
          ) : (
            <MapView
              ref={mapRef}
              style={styles.map}
              mapType={mapType}
              initialRegion={initialRegion}
              onPress={(e) => setTempMarker(e.nativeEvent.coordinate)}
              showsUserLocation={locationPermissionStatus === "granted"}
              showsMyLocationButton={false}
            >
              {renderedLayers}

              {/* Draggable Marker (New Point) */}
              {tempMarker && (
                <Marker
                  coordinate={tempMarker}
                  draggable
                  onDragEnd={(e) => setTempMarker(e.nativeEvent.coordinate)}
                  pinColor="#00C853"
                />
              )}
            </MapView>
          )}

          {/* Legenda */}
          {!shouldBlockMapRender && legendVisible && (
            <View
              style={[
                styles.legendContainer,
                { backgroundColor: theme.colors.surface },
              ]}
            >
              <View style={styles.legendHeader}>
                <Text
                  variant="titleSmall"
                  style={[
                    styles.legendTitle,
                    { color: theme.colors.onSurface },
                  ]}
                >
                  {t("mapView.legend")}
                </Text>
                <IconButton
                  icon="close"
                  size={16}
                  iconColor={theme.colors.onSurface}
                  onPress={() => setLegendVisible(false)}
                  style={styles.legendClose}
                />
              </View>

              {mapData.layerData && (
                <View style={styles.legendItem}>
                  <View
                    style={[styles.legendLine, { backgroundColor: "#4A90E2" }]}
                  />
                  <Text
                    variant="bodySmall"
                    style={{ color: theme.colors.onSurface }}
                  >
                    {t("mapView.map")}
                  </Text>
                </View>
              )}

              {mapData.routeData && (
                <View style={styles.legendItem}>
                  <View
                    style={[styles.legendLine, { backgroundColor: "#FF0000" }]}
                  />
                  <Text
                    variant="bodySmall"
                    style={{ color: theme.colors.onSurface }}
                  >
                    {t("mapView.route")}
                  </Text>
                </View>
              )}

              {tempMarker && (
                <View style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendMarker,
                      { backgroundColor: "#00C853" },
                    ]}
                  />
                  <Text
                    variant="bodySmall"
                    style={{ color: theme.colors.onSurface }}
                  >
                    {t("insertLocation.newPoint")}
                  </Text>
                </View>
              )}

              {mapData.surveyPoints.length > 0 && (
                <View style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendMarker,
                      { backgroundColor: "#FFD700" },
                    ]}
                  />
                  <Text
                    variant="bodySmall"
                    style={{ color: theme.colors.onSurface }}
                  >
                    {t("mapView.points")} ({mapData.surveyPoints.length})
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Legend button (when legend panel is closed) */}
          {!shouldBlockMapRender && !legendVisible && (
            <IconButton
              icon="map-legend"
              size={24}
              iconColor={theme.colors.primary}
              containerColor={theme.colors.surface}
              style={styles.legendButton}
              onPress={() => setLegendVisible(true)}
            />
          )}

          {/* GPS button */}
          {!shouldBlockMapRender && (
            <IconButton
              icon="crosshairs-gps"
              size={24}
              iconColor={theme.colors.primary}
              containerColor={theme.colors.surface}
              style={styles.gpsButton}
              onPress={handleZoomToUser}
            />
          )}

          {/* Map/layer button */}
          {!shouldBlockMapRender && mapData.layerData && (
            <IconButton
              icon="map"
              size={24}
              iconColor={theme.colors.primary}
              containerColor={theme.colors.surface}
              style={styles.mapButton}
              onPress={handleZoomToLayer}
            />
          )}

          {/* Route button */}
          {!shouldBlockMapRender && mapData.routeData && (
            <IconButton
              icon="routes"
              size={24}
              iconColor={theme.colors.primary}
              containerColor={theme.colors.surface}
              style={styles.routeButton}
              onPress={handleZoomToRoute}
            />
          )}

          {/* Coordinates Overlay */}
          {!shouldBlockMapRender && tempMarker && (
            <View
              style={[
                styles.coordsOverlay,
                { backgroundColor: theme.colors.surface, bottom: 100 + insets.bottom },
              ]}
            >
              <Text
                variant="labelSmall"
                style={{ color: theme.colors.onSurface }}
              >
                {t("insertLocation.latitude")}: {tempMarker.latitude.toFixed(6)}
              </Text>
              <Text
                variant="labelSmall"
                style={{ color: theme.colors.onSurface }}
              >
                {t("insertLocation.longitude")}:{" "}
                {tempMarker.longitude.toFixed(6)}
              </Text>
            </View>
          )}

          {/* Layers button */}
          {!shouldBlockMapRender && (
            <View style={[styles.fabContainer, { bottom: 24 + insets.bottom }]}>
              <FAB
                icon="layers"
                style={[styles.fab, { backgroundColor: theme.colors.surface }]}
                onPress={() => setMenuVisible(!menuVisible)}
                color={theme.colors.primary}
              />
            </View>
          )}

          {/* Layers menu component (same as the project map view screen -
              shows the map type's name next to its icon, since the icon
              alone doesn't communicate it clearly) */}
          <LayerMenu
            visible={!shouldBlockMapRender && menuVisible}
            onClose={() => setMenuVisible(false)}
            mapType={mapType}
            setMapType={setMapType}
            bottomOffset={98}
            t={t}
            theme={theme}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    elevation: 2,
  },
  mapContainer: { flex: 1 },
  map: { flex: 1 },
  mapFallback: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  mapFallbackText: {
    marginTop: 8,
    textAlign: "center",
    maxWidth: 420,
  },

  // Legenda
  legendContainer: {
    position: "absolute",
    top: MODAL_LEGEND_TOP_OFFSET,
    left: MAP_OVERLAY_MARGIN,
    padding: 12,
    borderRadius: 8,
    minWidth: 160,
    ...MAP_OVERLAY_SHADOW,
  },
  legendHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  legendTitle: { fontWeight: "bold" },
  legendClose: { margin: 0, width: 24, height: 24 },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 4,
  },
  legendLine: {
    width: 20,
    height: 3,
    borderRadius: 1.5,
    marginRight: 8,
  },
  legendMarker: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
    marginLeft: 4,
  },

  // Floating action buttons
  legendButton: {
    position: "absolute",
    top: MODAL_LEGEND_TOP_OFFSET,
    left: MAP_OVERLAY_MARGIN,
    elevation: 4,
  },
  gpsButton: {
    position: "absolute",
    top: MAP_OVERLAY_MARGIN,
    right: MAP_OVERLAY_MARGIN,
    elevation: 4,
  },
  mapButton: {
    position: "absolute",
    top: MAP_OVERLAY_MARGIN + MAP_OVERLAY_BUTTON_GAP,
    right: MAP_OVERLAY_MARGIN,
    elevation: 4,
  },
  routeButton: {
    position: "absolute",
    top: MAP_OVERLAY_MARGIN + 2 * MAP_OVERLAY_BUTTON_GAP,
    right: MAP_OVERLAY_MARGIN,
    elevation: 4,
  },

  coordsOverlay: {
    position: "absolute",
    bottom: 100,
    left: MAP_OVERLAY_MARGIN,
    padding: 8,
    borderRadius: 8,
    ...MAP_OVERLAY_SHADOW,
  },
  fabContainer: {
    position: "absolute",
    bottom: 24,
    right: MAP_OVERLAY_MARGIN,
    alignItems: "flex-end",
  },
  fab: { elevation: 4 },
});
