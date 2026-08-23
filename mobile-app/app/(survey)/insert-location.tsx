import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import {
  Card,
  Text,
  Button,
  TextInput,
  useTheme as usePaperTheme,
} from "react-native-paper";
import {
  Stack,
  useLocalSearchParams,
  useRouter,
  useFocusEffect,
} from "expo-router";
import { useBottomContentPadding } from "@/hooks/use-bottom-content-padding";
import * as Location from "expo-location";

// DB Imports
import { getProjectById } from "@/db/queries/projects";
import { getPointsByProject, updatePoint } from "@/db/queries/points";
import { getCustomProtocolById } from "@/db/queries/custom-protocols";
import { Project, Point } from "@/types/database";
import { useI18n } from "@/contexts/i18n-context";
import { useMapData } from "@/contexts/map-data-context";
import { useProtocolRegistry, resolveManifestId } from "@/contexts/protocol-registry-context";
import { useDialog } from "@/hooks/use-dialog";
import { useScrollToInput } from "@/hooks/use-scroll-to-input";
import { useLocationPermission } from "@/hooks/use-location-permission";
import { ErrorBoundaryThemed as ErrorBoundary } from "@/components/ErrorBoundary";

// Components Imports
import { LocationPickerModal } from "@/components/survey/InsertLocationModal";
import { BUTTON_RADIUS } from "@/constants/shape";

// Accepts "", "-", and partial decimals ("12.", "-12.34") so the user can keep
// typing; rejects any character that isn't a digit, "-", or ".".
const COORDINATE_INPUT_PATTERN = /^-?\d*\.?\d*$/;

// "numbers-and-punctuation" (which includes "-") only exists on iOS; on
// Android it silently falls back to the full alphanumeric keyboard. Android
// gets "decimal-pad" (digits + "." only, no minus) paired with the sign
// toggle icon on each field instead.
const COORDINATE_KEYBOARD_TYPE = Platform.select({
  ios: "numbers-and-punctuation" as const,
  default: "decimal-pad" as const,
});

function toggleCoordinateSign(value: string): string {
  if (value.startsWith("-")) return value.slice(1);
  if (value === "") return "-";
  return `-${value}`;
}

function makeCoordinateChangeHandler(
  setter: (value: string) => void,
  min?: number,
  max?: number,
) {
  return (text: string) => {
    if (!COORDINATE_INPUT_PATTERN.test(text)) return;
    if (text !== "" && text !== "-" && !text.endsWith(".")) {
      const parsed = Number(text);
      if (!Number.isFinite(parsed)) return;
      if (min !== undefined && parsed < min) return;
      if (max !== undefined && parsed > max) return;
    }
    setter(text);
  };
}

function InsertLocationScreen() {
  const {
    projectId,
    surveyPointId,
    latitude: initialLatitude,
    longitude: initialLongitude,
    altitude: initialAltitude,
  } = useLocalSearchParams<{
    projectId: string;
    surveyPointId?: string;
    latitude?: string;
    longitude?: string;
    altitude?: string;
  }>();
  const isEditMode = !!surveyPointId;
  const { t, currentLanguage } = useI18n();
  const { loadGeoJSONFile } = useMapData();
  const registry = useProtocolRegistry();
  const theme = usePaperTheme();
  const bottomPadding = useBottomContentPadding();
  const router = useRouter();
  const { showDialog } = useDialog();
  const { scrollViewRef, handleFocus } = useScrollToInput();
  const { ensurePermission: ensureLocationPermission } = useLocationPermission();

  // UI/Form States
  const [project, setProject] = useState<Project | null>(null);
  const [protocolName, setProtocolName] = useState<string>("");
  const [instructions, setInstructions] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  // Data States (Form)
  const [latitude, setLatitude] = useState(isEditMode ? initialLatitude ?? "" : "");
  const [longitude, setLongitude] = useState(isEditMode ? initialLongitude ?? "" : "");
  const [altitude, setAltitude] = useState(isEditMode ? initialAltitude ?? "" : "");
  const [isCapturing, setIsCapturing] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  // Map States
  const [mapModalVisible, setMapModalVisible] = useState(false);
  const [mapData, setMapData] = useState<{
    layerData: any;
    routeData: any;
    surveyPoints: Point[];
  }>({
    layerData: null,
    routeData: null,
    surveyPoints: [],
  });
  const [isMapDataLoaded, setIsMapDataLoaded] = useState(false);

  // Clears location fields when the screen regains focus, except in edit
  // mode, where the fields must keep the point's current coordinates.
  useFocusEffect(
    useCallback(() => {
      if (isEditMode) return;
      setLatitude("");
      setLongitude("");
      setAltitude("");
    }, [isEditMode]),
  );

  // 1. Main Effect: Loads Project + Starts loading Map in parallel
  useEffect(() => {
    const init = async () => {
      if (!projectId) return;
      try {
        const id = parseInt(projectId);
        const proj = await getProjectById(id);

        if (!proj) {
          showDialog({
            title: t("common.error"),
            message: t("projectView.projectNotFound"),
          });
          return router.back();
        }
        setProject(proj);

        if (!isEditMode) {
          // Set collection instructions and protocol name
          const manifestId = resolveManifestId(proj);
          const manifest = registry.getProtocol(manifestId);
          if (manifest?.kind === "custom" && proj.protocol_id) {
            const proto = await getCustomProtocolById(parseInt(proj.protocol_id));
            setInstructions(
              proto?.collection_instructions ||
                t("insertLocation.noInstructions"),
            );
            setProtocolName(proto?.name || t("insertLocation.customProtocol"));
          } else {
            const lang = (currentLanguage as string) ?? "pt";
            setInstructions(
              manifest?.description[lang] ??
                manifest?.description["pt"] ??
                t("insertLocation.standardInstructions"),
            );
            setProtocolName(
              manifest?.name[lang] ?? manifest?.name["pt"] ?? "Paisageo",
            );
          }
        }

        setIsLoading(false); // Release main UI immediately

        // --- BACKGROUND MAP LOADING ---
        // Runs silently while the user reads the collection instructions
        Promise.all([
          getPointsByProject(id),
          proj.geojson_layer ? loadGeoJSONFile(proj.geojson_layer) : null,
          proj.geojson_field_route
            ? loadGeoJSONFile(proj.geojson_field_route)
            : null,
        ])
          .then(([points, layer, route]) => {
            setMapData({
              surveyPoints: points as Point[],
              layerData: layer,
              routeData: route,
            });
            setIsMapDataLoaded(true);
          })
          .catch((err) =>
            console.error("Background map loading error:", err),
          );
      } catch (error) {
        console.error(error);
        setIsLoading(false);
      }
    };
    init();
  }, [projectId, isEditMode, loadGeoJSONFile, router, showDialog, t]);

  // Handlers
  const handleCaptureLocation = async () => {
    try {
      setIsCapturing(true);
      const granted = await ensureLocationPermission();
      if (!granted) throw new Error("Permission denied");

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLatitude(loc.coords.latitude.toFixed(6));
      setLongitude(loc.coords.longitude.toFixed(6));
      if (loc.coords.altitude) setAltitude(loc.coords.altitude.toFixed(1));

      showDialog({
        title: t("common.success"),
        message: t("insertLocation.locationCaptured"),
      });
    } catch {
      showDialog({
        title: t("common.error"),
        message: t("insertLocation.locationPermissionDenied"),
      });
    } finally {
      setIsCapturing(false);
    }
  };

  const handleOpenMap = () => {
    // Opens the modal instantly (data should already be loaded or loading)
    setMapModalVisible(true);
  };

  const handleMapConfirm = (coords: {
    latitude: number;
    longitude: number;
  }) => {
    setLatitude(coords.latitude.toFixed(6));
    setLongitude(coords.longitude.toFixed(6));
    setMapModalVisible(false);
  };

  const handleLatitudeChange = makeCoordinateChangeHandler(setLatitude, -90, 90);
  const handleLongitudeChange = makeCoordinateChangeHandler(setLongitude, -180, 180);
  const handleAltitudeChange = makeCoordinateChangeHandler(setAltitude);

  const handleAdvance = async () => {
    // Prevents duplicate navigation on rapid clicks
    if (isNavigating) return;

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    if (!latitude || !longitude)
      return showDialog({
        title: t("common.error"),
        message: t("insertLocation.coordinatesRequired"),
      });
    if (isNaN(lat) || isNaN(lon))
      return showDialog({
        title: t("common.error"),
        message: t("insertLocation.invalidCoordinates"),
      });

    setIsNavigating(true);

    if (isEditMode) {
      try {
        const ok = await updatePoint(parseInt(surveyPointId as string), {
          lat,
          lon,
          altitude: altitude ? Number(altitude) : null,
        });
        if (ok) {
          showDialog({
            title: t("common.success"),
            message: t("insertLocation.editLocationSuccess"),
          });
          router.back();
        } else {
          showDialog({
            title: t("common.error"),
            message: t("insertLocation.editLocationError"),
          });
        }
      } catch (error) {
        console.error("Error updating point location:", error);
        showDialog({
          title: t("common.error"),
          message: t("insertLocation.editLocationError"),
        });
      } finally {
        setIsNavigating(false);
      }
      return;
    }

    const mId = resolveManifestId(project!);
    const customDbParam =
      mId === "custom" && project?.protocol_id
        ? `&customProtocolDbId=${project.protocol_id}`
        : "";
    router.push(
      `/survey/form?projectId=${projectId}&latitude=${lat}&longitude=${lon}&altitude=${altitude}&protocolId=${mId}${customDbParam}` as any,
    );

    // Reset flag after 1 second (extra safety)
    setTimeout(() => setIsNavigating(false), 1000);
  };

  // Rendering
  if (isLoading)
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <Stack.Screen
        options={{
          title: t(isEditMode ? "insertLocation.editTitle" : "insertLocation.title"),
          headerShown: true,
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 80}
        style={{ flex: 1 }}
      >
        <ScrollView ref={scrollViewRef} contentContainerStyle={styles.content}>
          {!isEditMode && (
            <>
              <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                <Card.Title title={project?.name} subtitle={protocolName} />
              </Card>

              <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
                <Card.Content>
                  <Text style={{ textAlign: "justify" }}>{instructions}</Text>
                </Card.Content>
              </Card>
            </>
          )}

          <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
            <Card.Title title={t("insertLocation.location")} />
            <Card.Content>
              <View style={styles.row}>
                <Button
                  mode="contained"
                  icon="crosshairs-gps"
                  onPress={handleCaptureLocation}
                  loading={isCapturing}
                  style={[styles.flex, { borderRadius: BUTTON_RADIUS }]}
                >
                  {t("insertLocation.captureDevice")}
                </Button>
                <Button
                  mode="contained"
                  icon="map"
                  onPress={handleOpenMap}
                  loading={!isMapDataLoaded && mapModalVisible} // Shows loading only if opened before finishing
                  style={[styles.flex, { borderRadius: BUTTON_RADIUS }]}
                >
                  {t("insertLocation.insertOnMap")}
                </Button>
              </View>

              <TextInput
                label={t("insertLocation.latitude")}
                value={latitude}
                onChangeText={handleLatitudeChange}
                onFocus={handleFocus}
                keyboardType={COORDINATE_KEYBOARD_TYPE}
                mode="outlined"
                style={styles.input}
                right={
                  <TextInput.Icon
                    icon={latitude.startsWith("-") ? "plus" : "minus"}
                    onPress={() => setLatitude(toggleCoordinateSign(latitude))}
                    forceTextInputFocus={false}
                  />
                }
              />
              <TextInput
                label={t("insertLocation.longitude")}
                value={longitude}
                onChangeText={handleLongitudeChange}
                onFocus={handleFocus}
                keyboardType={COORDINATE_KEYBOARD_TYPE}
                mode="outlined"
                style={styles.input}
                right={
                  <TextInput.Icon
                    icon={longitude.startsWith("-") ? "plus" : "minus"}
                    onPress={() => setLongitude(toggleCoordinateSign(longitude))}
                    forceTextInputFocus={false}
                  />
                }
              />
              <TextInput
                label={t("insertLocation.altitude")}
                value={altitude}
                onChangeText={handleAltitudeChange}
                onFocus={handleFocus}
                keyboardType={COORDINATE_KEYBOARD_TYPE}
                mode="outlined"
                style={styles.input}
                right={
                  <TextInput.Icon
                    icon={altitude.startsWith("-") ? "plus" : "minus"}
                    onPress={() => setAltitude(toggleCoordinateSign(altitude))}
                    forceTextInputFocus={false}
                  />
                }
              />
            </Card.Content>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: bottomPadding,
            backgroundColor: theme.colors.surface,
          },
        ]}
      >
        <Button
          mode="contained"
          icon={isEditMode ? "check" : "arrow-right"}
          onPress={handleAdvance}
          disabled={isNavigating}
          contentStyle={{ height: 48 }}
          style={{ borderRadius: BUTTON_RADIUS }}
        >
          {t(isEditMode ? "insertLocation.confirmLocation" : "insertLocation.advance")}
        </Button>
      </View>

      {/* Separate Modal */}
      <LocationPickerModal
        visible={mapModalVisible}
        onDismiss={() => setMapModalVisible(false)}
        onConfirm={handleMapConfirm}
        mapData={mapData}
        initialCoordinate={
          latitude && longitude
            ? {
                latitude: parseFloat(latitude),
                longitude: parseFloat(longitude),
              }
            : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { padding: 16, paddingBottom: 100 },
  card: { marginBottom: 16 },
  row: { flexDirection: "row", gap: 8, marginBottom: 16 },
  flex: { flex: 1 },
  input: { marginBottom: 12, backgroundColor: "transparent" },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
});

export default function WrappedInsertLocationScreen() {
  return (
    <ErrorBoundary>
      <InsertLocationScreen />
    </ErrorBoundary>
  );
}
