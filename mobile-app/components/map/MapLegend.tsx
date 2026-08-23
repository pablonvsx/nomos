import React from "react";
import { View, StyleSheet } from "react-native";
import { IconButton, Text } from "react-native-paper";
import type { MD3Theme } from "react-native-paper";
import { MAP_OVERLAY_MARGIN, MAP_OVERLAY_SHADOW } from "./map-overlay-styles";

interface MapLegendProps {
  visible: boolean;
  onClose: () => void;
  hasLayer: boolean;
  hasRoute: boolean;
  pointsCount: number;
  hasCurrentPoint: boolean;
  topOffset: number;
  t: (key: string) => string;
  theme: MD3Theme;
}

export function MapLegend({
  visible,
  onClose,
  hasLayer,
  hasRoute,
  pointsCount,
  hasCurrentPoint,
  topOffset,
  t,
  theme,
}: MapLegendProps) {
  if (!visible) return null;

  return (
    <View
      style={[
        styles.legendContainer,
        { top: topOffset, backgroundColor: theme.colors.surface },
      ]}
    >
      <View style={styles.legendHeader}>
        <Text
          variant="titleSmall"
          style={[styles.legendTitle, { color: theme.colors.onSurface }]}
        >
          {t("mapView.legend")}
        </Text>
        <IconButton
          icon="close"
          size={16}
          iconColor={theme.colors.onSurface}
          onPress={onClose}
          style={styles.legendClose}
        />
      </View>

      {hasLayer && (
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: "#4A90E2" }]} />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurface }}>
            {t("mapView.map")}
          </Text>
        </View>
      )}

      {hasRoute && (
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: "#FF0000" }]} />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurface }}>
            {t("mapView.route")}
          </Text>
        </View>
      )}

      {hasCurrentPoint && (
        <View style={styles.legendItem}>
          <View style={[styles.legendMarker, { backgroundColor: "#00C853" }]} />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurface }}>
            {t("mapView.currentPoint")}
          </Text>
        </View>
      )}

      {pointsCount > 0 && (
        <View style={styles.legendItem}>
          <View style={[styles.legendMarker, { backgroundColor: "#FFD700" }]} />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurface }}>
            {t("mapView.points")} ({pointsCount})
          </Text>
        </View>
      )}

      {!hasLayer && !hasRoute && pointsCount === 0 && (
        <Text
          variant="bodySmall"
          style={[styles.noDataText, { color: theme.colors.onSurfaceVariant }]}
        >
          {t("mapView.noData")}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  legendContainer: {
    position: "absolute",
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
  legendItem: { flexDirection: "row", alignItems: "center", marginVertical: 4 },
  legendLine: { width: 20, height: 3, borderRadius: 1.5, marginRight: 8 },
  legendMarker: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
    marginLeft: 4,
  },
  noDataText: { fontStyle: "italic", opacity: 0.7 },
});
