import React from "react";
import { StyleSheet } from "react-native";
import { Dialog, Portal, Text, useTheme } from "react-native-paper";
import { ModalActions } from "@/components/ui/ModalActions";
import { MODAL_TITLE_STYLE } from "@/constants/modal-title";
import { MODAL_SHAPE_STYLE } from "@/constants/shape";
import { useI18n } from "@/contexts/i18n-context";
import type { ExportGateReason } from "@/core/project-sharing/export-gate";

interface Props {
  /** null hides the dialog. */
  warning: { reason: ExportGateReason; canBackup: boolean } | null;
  /** Back or a tap outside: cancels, nothing is exported. */
  onDismiss: () => void;
  onExportAnyway: () => void;
  onBackup: () => void;
}

/** Shown before the owner exports a package that is out of date with (or cannot be checked against) the Drive backup. */
export function ExportWarningDialog({ warning, onDismiss, onExportAnyway, onBackup }: Props) {
  const theme = useTheme();
  const { t } = useI18n();

  return (
    <Portal>
      <Dialog visible={warning !== null} onDismiss={onDismiss} style={[MODAL_SHAPE_STYLE, { backgroundColor: theme.colors.surface }]}>
        <Dialog.Title style={MODAL_TITLE_STYLE}>{t("driveBackup.exportWarning.title")}</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">
            {warning?.reason === "pending"
              ? t("driveBackup.exportWarning.pending")
              : t("driveBackup.exportWarning.unverifiable")}
          </Text>
          {warning && !warning.canBackup && (
            <Text variant="bodySmall" style={[styles.note, { color: theme.colors.error }]}>
              {t("driveBackup.exportWarning.offline")}
            </Text>
          )}
        </Dialog.Content>
        <ModalActions
          cancelLabel={t("driveBackup.exportWarning.exportAnyway")}
          onCancel={onExportAnyway}
          confirmLabel={t("driveBackup.exportWarning.backup")}
          onConfirm={onBackup}
          confirmDisabled={warning !== null && !warning.canBackup}
        />
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  note: { marginTop: 12 },
});
