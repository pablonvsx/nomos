import React from "react";
import { Dialog } from "react-native-paper";
import { MODAL_PADDING_TOP, MODAL_TITLE_GAP } from "@/constants/modal-layout";
import { MODAL_TITLE_STYLE } from "@/constants/modal-title";

/**
 * The body of a dialog that ends in a ModalActions footer. It is Paper's
 * Dialog.Content without its 24dp bottom padding: the footer owns the space
 * above its buttons (MODAL_FOOTER_GAP_ABOVE), so the two never add up.
 */
export function ModalBody({ style, ...rest }: React.ComponentProps<typeof Dialog.Content>) {
  return <Dialog.Content style={[{ paddingBottom: 0 }, style]} {...rest} />;
}

/**
 * A dialog's title with the shared type style and the shared vertical rhythm:
 * MODAL_PADDING_TOP above it and MODAL_TITLE_GAP between it and the body (Paper's
 * own title margins are 16 and 16).
 */
export function ModalTitle({ style, ...rest }: React.ComponentProps<typeof Dialog.Title>) {
  return (
    <Dialog.Title
      style={[MODAL_TITLE_STYLE, { marginTop: MODAL_PADDING_TOP, marginBottom: MODAL_TITLE_GAP }, style]}
      {...rest}
    />
  );
}
