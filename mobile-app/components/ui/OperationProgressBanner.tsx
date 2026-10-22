import React from "react";
import { View, StyleSheet } from "react-native";
import { ActivityIndicator, ProgressBar, Text, useTheme } from "react-native-paper";
import type { OperationState } from "@/hooks/use-exclusive-operation";
import { BUTTON_RADIUS } from "@/constants/shape";

interface Props {
  operation: OperationState | null;
}

/** Loading banner for a long operation; renders nothing when idle. */
export function OperationProgressBanner({ operation }: Props) {
  const theme = useTheme();
  if (!operation) return null;

  const hasProgress = operation.total !== undefined && operation.total > 0 && operation.current !== undefined;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.secondaryContainer, borderRadius: BUTTON_RADIUS },
      ]}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.row}>
        <ActivityIndicator size={20} />
        <Text variant="bodyMedium" style={[styles.label, { color: theme.colors.onSecondaryContainer }]}>
          {operation.label}
        </Text>
      </View>
      {hasProgress && (
        <ProgressBar
          progress={operation.current! / operation.total!}
          color={theme.colors.primary}
          style={styles.bar}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginHorizontal: 16, marginVertical: 8, padding: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  label: { flex: 1 },
  bar: { height: 6, borderRadius: 3, marginTop: 8 },
});
