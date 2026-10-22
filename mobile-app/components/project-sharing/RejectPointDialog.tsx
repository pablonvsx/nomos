import React, { useEffect, useState } from "react";
import { Button, Dialog, Portal, TextInput } from "react-native-paper";
import { useI18n } from "@/contexts/i18n-context";
import { BUTTON_RADIUS } from "@/constants/shape";

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
        <Dialog.Title>{t("pointApproval.reject")}</Dialog.Title>
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
        <Dialog.Actions>
          <Button onPress={onCancel} disabled={busy} style={{ borderRadius: BUTTON_RADIUS }}>
            {t("common.cancel")}
          </Button>
          <Button
            mode="contained"
            onPress={() => onConfirm(trimmed)}
            disabled={busy || !trimmed}
            loading={busy}
            style={{ borderRadius: BUTTON_RADIUS }}
          >
            {t("pointApproval.reject")}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}
