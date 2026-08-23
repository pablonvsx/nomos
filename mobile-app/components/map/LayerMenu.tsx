import React, { useEffect, useRef } from "react";
import { View, Animated, Platform, StyleSheet } from "react-native";
import { IconButton, Text } from "react-native-paper";
import type { MD3Theme } from "react-native-paper";
import type { MapType } from "react-native-maps";
import { MAP_OVERLAY_SHADOW } from "./map-overlay-styles";

interface LayerMenuProps {
  visible: boolean;
  onClose: () => void;
  mapType: MapType;
  setMapType: (type: MapType) => void;
  bottomOffset: number;
  t: (key: string) => string;
  theme: MD3Theme;
}

const AVAILABLE_MAP_TYPES: MapType[] =
  Platform.OS === "ios"
    ? ["standard", "satellite", "hybrid"]
    : ["standard", "satellite", "hybrid", "terrain"];

// Header + one row per map type; computed instead of hardcoded so the
// menu doesn't clip items when AVAILABLE_MAP_TYPES grows (it did on
// Android, whose 4th entry, "terrain", was cut off by a fixed height
// sized for iOS's 3 entries).
const MENU_HEADER_HEIGHT = 60;
const MENU_ITEM_HEIGHT = 48;
const MENU_BOTTOM_PADDING = 24;
const MENU_MAX_HEIGHT =
  MENU_HEADER_HEIGHT +
  AVAILABLE_MAP_TYPES.length * MENU_ITEM_HEIGHT +
  MENU_BOTTOM_PADDING;

function getIconForType(type: MapType): string {
  if (type === "hybrid") return "image-filter-hdr";
  if (type === "standard") return "map";
  if (type === "terrain") return "terrain";
  return "satellite-variant";
}

export function LayerMenu({
  visible,
  onClose,
  mapType,
  setMapType,
  bottomOffset,
  t,
  theme,
}: LayerMenuProps) {
  const animatedHeight = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(animatedHeight, {
      toValue: visible ? 1 : 0,
      useNativeDriver: false,
      tension: 100,
      friction: 10,
    }).start();
  }, [visible, animatedHeight]);

  const menuHeight = animatedHeight.interpolate({
    inputRange: [0, 1],
    outputRange: [0, MENU_MAX_HEIGHT],
  });

  const opacity = animatedHeight.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0.5, 1],
  });

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.expandableMenu,
        {
          bottom: bottomOffset,
          right: 16,
          height: menuHeight,
          opacity,
          backgroundColor: theme.colors.surface,
        },
      ]}
    >
      <View style={styles.menuContent}>
        <View style={styles.menuHeader}>
          <Text
            variant="titleSmall"
            style={[styles.menuTitle, { color: theme.colors.onSurface }]}
          >
            {t("mapView.mapType")}
          </Text>
          <IconButton
            icon="close"
            size={18}
            iconColor={theme.colors.onSurface}
            onPress={onClose}
            style={styles.menuCloseBtn}
          />
        </View>
        <View style={styles.menuItems}>
          {AVAILABLE_MAP_TYPES.map((type) => (
            <View key={type} style={styles.menuItem}>
              <IconButton
                icon={getIconForType(type)}
                iconColor={
                  mapType === type
                    ? theme.colors.primary
                    : theme.colors.onSurfaceVariant
                }
                selected={mapType === type}
                onPress={() => {
                  setMapType(type);
                  onClose();
                }}
              />
              <Text variant="bodySmall" style={{ color: theme.colors.onSurface }}>
                {t(`mapView.${type}`)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  expandableMenu: {
    position: "absolute",
    borderRadius: 12,
    overflow: "hidden",
    minWidth: 160,
    ...MAP_OVERLAY_SHADOW,
  },
  menuContent: {
    flex: 1,
    padding: 12,
  },
  menuHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  menuTitle: {
    fontWeight: "bold",
    flex: 1,
  },
  menuCloseBtn: {
    margin: 0,
    padding: 0,
  },
  menuItems: {
    gap: 2,
    marginTop: 4,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
    marginLeft: -8,
  },
});
