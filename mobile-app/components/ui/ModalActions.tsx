import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Button, useTheme } from "react-native-paper";
import { BUTTON_RADIUS } from "@/constants/shape";
import { guardPress, resolveModalActions } from "@/core/ui/modal-actions";

export interface ModalActionsProps {
  confirmLabel: string;
  onConfirm: () => void;
  /** Omit for a single-action modal (e.g. OK): the confirm button stays in the right column. */
  cancelLabel?: string;
  onCancel?: () => void;
  confirmDisabled?: boolean;
  cancelDisabled?: boolean;
  /** Shows a spinner on the confirm button and blocks both buttons. */
  loading?: boolean;
  /** Paints the confirm button with the theme's error color. */
  destructive?: boolean;
  confirmIcon?: string;
  /** "outline" for a confirm slot that carries a secondary action (e.g. a lone Cancel). Default "solid". */
  confirmVariant?: "solid" | "outline";
  style?: StyleProp<ViewStyle>;
}

const MIN_HEIGHT = 48;

/**
 * Split modal footer: cancel (outlined) on the left half, confirm (solid) on the right half.
 * Without a cancel action the confirm button stays on the right half.
 */
export function ModalActions({
  confirmLabel,
  onConfirm,
  cancelLabel,
  onCancel,
  confirmDisabled,
  cancelDisabled,
  loading,
  destructive,
  confirmIcon,
  confirmVariant = "solid",
  style,
}: ModalActionsProps) {
  const theme = useTheme();
  const hasCancel = cancelLabel !== undefined && onCancel !== undefined;
  const state = resolveModalActions({ hasCancel, confirmDisabled, cancelDisabled, loading });
  const buttonStyle = [styles.button, { borderRadius: BUTTON_RADIUS }];

  const confirmButton = (
    <Button
      mode={confirmVariant === "outline" ? "outlined" : "contained"}
      onPress={guardPress(onConfirm, state.confirmBlocked)}
      disabled={state.confirmBlocked && !loading}
      loading={loading}
      icon={confirmIcon}
      buttonColor={destructive ? theme.colors.error : undefined}
      textColor={destructive ? theme.colors.onError : undefined}
      style={buttonStyle}
      contentStyle={styles.content}
      labelStyle={styles.label}
    >
      {confirmLabel}
    </Button>
  );

  if (state.layout === "single") {
    // Same slot the confirm button has in the split layout: the right half.
    return (
      <View style={[styles.row, style]}>
        <View style={styles.column} />
        <View style={styles.column}>{confirmButton}</View>
      </View>
    );
  }

  return (
    <View style={[styles.row, style]}>
      <View style={styles.column}>
        <Button
          mode="outlined"
          onPress={guardPress(onCancel as () => void, state.cancelBlocked)}
          disabled={state.cancelBlocked}
          style={buttonStyle}
          contentStyle={styles.content}
          labelStyle={styles.label}
        >
          {cancelLabel}
        </Button>
      </View>
      <View style={styles.column}>{confirmButton}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignSelf: "stretch", paddingVertical: 4 },
  column: { flex: 1, alignItems: "center", paddingHorizontal: 8 },
  button: { minWidth: 120, maxWidth: "100%" },
  content: { minHeight: MIN_HEIGHT },
  label: { flexShrink: 1 },
});
