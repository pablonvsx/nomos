import { MODAL_TITLE_STYLE } from "@/constants/modal-title";
import React, { useEffect, useState } from "react";
import { Dialog, Portal, TextInput } from "react-native-paper";
import { useI18n } from "@/contexts/i18n-context";
import { ModalActions } from "@/components/ui/ModalActions";

interface RejectPointDialogProps {
  visible: boolean;
  /** True while the rejection is being saved: locks the buttons. */
  busy?: boolean;
  onCancel: () => void;
  /** Receives the trimmed, non-empty reason. */
  onConfirm: (reason: string) => void;
}

/**
 * Asks the owner for the (required) reason of a rejection. Shared by the
 * pending-approvals queue and the point details review mode. It has its own
 * Portal, so a caller that has to report an error must close it first and
 * wait (core/ui/close-then-show.ts) - an alert shown while it is open would
 * render behind it.
 */
export function RejectPointDialog({ visible, busy = false, onCancel, onConfirm }: RejectPointDialogProps) {
  const { t } = useI18n();
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (visible) setReason("");
  }, [visible]);

  const trimmed = reason.trim();

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={busy ? undefined : onCancel}>
        <Dialog.Title style={MODAL_TITLE_STYLE}>{t("pointApproval.reject")}</Dialog.Title>
        <Dialog.Content>
          <TextInput
            mode="outlined"
            label={t("pointApproval.rejectionReasonLabel")}
            placeholder={t("pointApproval.rejectionReasonPlaceholder")}
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={3}
            disabled={busy}
          />
        </Dialog.Content>
        <ModalActions
          cancelLabel={t("common.cancel")}
          onCancel={onCancel}
          cancelDisabled={busy}
          confirmLabel={t("pointApproval.reject")}
          onConfirm={() => onConfirm(trimmed)}
          confirmDisabled={!trimmed}
          loading={busy}
        />
      </Dialog>
    </Portal>
  );
}
