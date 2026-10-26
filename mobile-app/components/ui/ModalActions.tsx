import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Button, useTheme } from "react-native-paper";
import {
  MODAL_FOOTER_GAP_ABOVE,
  MODAL_FOOTER_GAP_BELOW,
  MODAL_INLINE_ACTIONS_GAP,
  MODAL_PADDING_H,
  MODAL_STACKED_GAP,
} from "@/constants/modal-layout";
import { BUTTON_RADIUS } from "@/constants/shape";
import { guardPress, resolveModalActions } from "@/core/ui/modal-actions";
import { buttonMetrics, type FooterButtonVariant } from "@/core/ui/modal-layout";

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
  /**
   * The buttons sit inside the modal's content (for example one pair per list row), not in
   * its footer: they take the content's width and only MODAL_INLINE_ACTIONS_GAP above them.
   */
  inline?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Gutter inside each column, so the buttons of the two halves never touch. */
const COLUMN_GUTTER = 8;

/**
 * Button look shared by the split and the stacked footer: the same outer height
 * (48), the same border width and radius, a label with no vertical margin. The
 * outlined button draws its border in the theme color and the solid one draws it
 * transparent, so the outline never makes a button taller than the other.
 */
function footerButtonLook(variant: FooterButtonVariant) {
  const metrics = buttonMetrics(variant);
  return {
    style: {
      borderRadius: BUTTON_RADIUS,
      borderWidth: metrics.borderWidth,
      ...(variant === "solid" ? { borderColor: "transparent" } : null),
    },
    contentStyle: { height: metrics.contentHeight },
    labelStyle: { marginVertical: 0, flexShrink: 1 },
  };
}

/**
 * Split modal footer: cancel (outlined) on the left half, confirm (solid) on the right half.
 * Without a cancel action the confirm button stays on the right half.
 *
 * The footer OWNS the vertical space around its buttons (MODAL_FOOTER_GAP_ABOVE and
 * _BELOW, equal, so the buttons sit centered in the band). Whatever is above it must
 * end with no bottom padding of its own (see ModalBody and MODAL_SCROLL_AREA_STYLE).
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
  inline = false,
  style,
}: ModalActionsProps) {
  const theme = useTheme();
  const hasCancel = cancelLabel !== undefined && onCancel !== undefined;
  const state = resolveModalActions({ hasCancel, confirmDisabled, cancelDisabled, loading });
  const confirmLook = footerButtonLook(confirmVariant === "outline" ? "outline" : "solid");
  const cancelLook = footerButtonLook("outline");

  const confirmButton = (
    <Button
      mode={confirmVariant === "outline" ? "outlined" : "contained"}
      onPress={guardPress(onConfirm, state.confirmBlocked)}
      disabled={state.confirmBlocked && !loading}
      loading={loading}
      icon={confirmIcon}
      buttonColor={destructive ? theme.colors.error : undefined}
      textColor={destructive ? theme.colors.onError : undefined}
      style={[styles.button, confirmLook.style]}
      contentStyle={confirmLook.contentStyle}
      labelStyle={confirmLook.labelStyle}
    >
      {confirmLabel}
    </Button>
  );

  const rowStyle = inline ? styles.rowInline : styles.row;

  if (state.layout === "single") {
    // Same slot the confirm button has in the split layout: the right half.
    return (
      <View style={[rowStyle, style]}>
        <View style={styles.column} />
        <View style={styles.column}>{confirmButton}</View>
      </View>
    );
  }

  return (
    <View style={[rowStyle, style]}>
      <View style={styles.column}>
        <Button
          mode="outlined"
          onPress={guardPress(onCancel as () => void, state.cancelBlocked)}
          disabled={state.cancelBlocked}
          style={[styles.button, cancelLook.style]}
          contentStyle={cancelLook.contentStyle}
          labelStyle={cancelLook.labelStyle}
        >
          {cancelLabel}
        </Button>
      </View>
      <View style={styles.column}>{confirmButton}</View>
    </View>
  );
}

export interface StackedAction {
  label: string;
  onPress: () => void;
  /** The primary action is solid; every other one is outlined. */
  primary?: boolean;
  destructive?: boolean;
  disabled?: boolean;
}

/**
 * The footer for three or more actions (or labels too long for two columns): one
 * full-width button per row, in the order given. Same tokens as ModalActions: the
 * same space above and below, the same button height, MODAL_STACKED_GAP between them.
 */
export function ModalActionsStacked({ actions, style }: { actions: StackedAction[]; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const solid = footerButtonLook("solid");
  const outline = footerButtonLook("outline");

  return (
    <View style={[styles.stacked, style]}>
      {actions.map((action, index) => {
        const look = action.primary ? solid : outline;
        return (
          <Button
            key={`${action.label}-${index}`}
            mode={action.primary ? "contained" : "outlined"}
            onPress={action.onPress}
            disabled={action.disabled}
            textColor={action.destructive ? theme.colors.error : undefined}
            style={[styles.stackedButton, look.style]}
            contentStyle={look.contentStyle}
            labelStyle={look.labelStyle}
          >
            {action.label}
          </Button>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignSelf: "stretch",
    // The columns carry a gutter of their own, so the buttons' outer edge lands on the modal's padding.
    paddingHorizontal: MODAL_PADDING_H - COLUMN_GUTTER,
    paddingTop: MODAL_FOOTER_GAP_ABOVE,
    paddingBottom: MODAL_FOOTER_GAP_BELOW,
  },
  rowInline: {
    flexDirection: "row",
    alignSelf: "stretch",
    marginHorizontal: -COLUMN_GUTTER,
    paddingTop: MODAL_INLINE_ACTIONS_GAP,
  },
  column: { flex: 1, alignItems: "center", paddingHorizontal: COLUMN_GUTTER },
  button: { minWidth: 120, maxWidth: "100%" },
  stacked: {
    alignSelf: "stretch",
    paddingHorizontal: MODAL_PADDING_H,
    paddingTop: MODAL_FOOTER_GAP_ABOVE,
    paddingBottom: MODAL_FOOTER_GAP_BELOW,
    gap: MODAL_STACKED_GAP,
  },
  stackedButton: { width: "100%" },
});
