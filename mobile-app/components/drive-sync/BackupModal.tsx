import React, { useEffect, useReducer, useState } from "react";
import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, ProgressBar, Text, TouchableRipple, useTheme } from "react-native-paper";
import { ModalActions } from "@/components/ui/ModalActions";
import { MODAL_TITLE_STYLE } from "@/constants/modal-title";
import { MODAL_SHAPE_STYLE } from "@/constants/shape";
import { useI18n } from "@/contexts/i18n-context";
import {
  dismissBackupResult,
  requestBackupCancel,
  type BackupFailure,
  type BackupResult,
} from "@/core/drive-sync/backup-session";
import { deriveBackupModalView, initialBackupModalUi, reduceBackupModal } from "@/core/ui/backup-modal-state";
import { useBackupSession } from "@/hooks/use-backup-session";

/**
 * The one backup modal, mounted once at the app root. It holds the person
 * until the backup ends: tapping outside or pressing Android's back asks
 * whether to cancel instead of closing, and a finished backup closes only
 * through OK. Works for both scopes; only the stage text differs.
 */
export function BackupModal() {
  const theme = useTheme();
  const { t } = useI18n();
  const session = useBackupSession();
  const [ui, dispatch] = useReducer(
    (state: typeof initialBackupModalUi, event: Parameters<typeof reduceBackupModal>[1]) =>
      reduceBackupModal(state, event, session),
    initialBackupModalUi,
  );

  useEffect(() => {
    dispatch({ type: "sessionChanged" });
  }, [session]);

  const view = deriveBackupModalView(session, ui);
  if (view.kind === "hidden") return null;

  const stage = session.phase === "running" ? session.stage : null;
  const stageText = stage ? t(stage.key, stage.params) : t("driveBackup.stage.preparing");

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => dispatch({ type: "backPressed" })}>
      <View style={[styles.backdrop, { backgroundColor: theme.colors.backdrop }]}>
        {/* A tap on the backdrop never closes: it opens the same cancel confirmation as Back. */}
        <TouchableRipple style={StyleSheet.absoluteFill} onPress={() => dispatch({ type: "backPressed" })}>
          <View />
        </TouchableRipple>
        <View style={[styles.card, MODAL_SHAPE_STYLE, { backgroundColor: theme.colors.surface }]}>
          {view.kind === "running" && (
            <>
              <Text style={[MODAL_TITLE_STYLE, { color: theme.colors.onSurface }]}>{t("driveBackup.modalTitle")}</Text>
              <Text variant="bodyMedium" style={[styles.body, { color: theme.colors.onSurface }]}>
                {stageText}
              </Text>
              <ProgressBar
                progress={view.progress ?? 0}
                indeterminate={view.progress === null}
                color={theme.colors.primary}
                style={styles.bar}
              />
              <Text variant="bodySmall" style={[styles.body, { color: theme.colors.onSurfaceVariant }]}>
                {t("driveBackup.keepAppOpen")}
              </Text>
              <ModalActions
                confirmLabel={t("common.cancel")}
                confirmVariant="outline"
                onConfirm={() => dispatch({ type: "backPressed" })}
              />
            </>
          )}

          {view.kind === "confirmingCancel" && (
            <>
              <Text style={[MODAL_TITLE_STYLE, { color: theme.colors.onSurface }]}>
                {t("driveBackup.cancelTitle")}
              </Text>
              <Text variant="bodyMedium" style={[styles.body, { color: theme.colors.onSurface }]}>
                {t("driveBackup.cancelMessage")}
              </Text>
              <ModalActions
                cancelLabel={t("driveBackup.keepGoing")}
                onCancel={() => dispatch({ type: "keepGoing" })}
                confirmLabel={t("driveBackup.cancelConfirm")}
                onConfirm={() => {
                  dispatch({ type: "cancelConfirmed" });
                  requestBackupCancel();
                }}
                destructive
              />
            </>
          )}

          {view.kind === "cancelling" && (
            <>
              <Text style={[MODAL_TITLE_STYLE, { color: theme.colors.onSurface }]}>{t("driveBackup.modalTitle")}</Text>
              <View style={styles.cancellingRow}>
                <ActivityIndicator size={20} />
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, flex: 1 }}>
                  {t("driveBackup.cancelling")}
                </Text>
              </View>
            </>
          )}

          {view.kind === "finished" && <FinishedContent result={view.result} />}
        </View>
      </View>
    </Modal>
  );
}

function FinishedContent({ result }: { result: BackupResult }) {
  const theme = useTheme();
  const { t } = useI18n();
  const [showDetails, setShowDetails] = useState(false);

  const params = { sent: String(result.sent), notSent: String(result.notSent) };
  const titleKey = `driveBackup.result.${result.outcome}.title`;
  const messageKey =
    result.outcome === "error"
      ? result.error?.reasonKey ?? "driveBackup.reason.unknown"
      : `driveBackup.result.${result.outcome}.message`;

  const details = [
    ...result.failures.map((f) => (f.detail ? `${f.label}: ${f.detail}` : null)),
    result.error?.detail ?? null,
  ].filter((line): line is string => Boolean(line));

  return (
    <>
      <Text style={[MODAL_TITLE_STYLE, { color: theme.colors.onSurface }]}>{t(titleKey)}</Text>
      <Text variant="bodyMedium" style={[styles.body, { color: theme.colors.onSurface }]}>
        {t(messageKey, params)}
      </Text>

      {result.failures.length > 0 && (
        <ScrollView style={styles.failures}>
          {result.failures.map((failure, index) => (
            <FailureLine key={`${failure.label}-${index}`} failure={failure} />
          ))}
        </ScrollView>
      )}

      {details.length > 0 && (
        <>
          <TouchableRipple onPress={() => setShowDetails((v) => !v)} style={styles.detailsToggle}>
            <Text variant="labelMedium" style={{ color: theme.colors.primary }}>
              {showDetails ? t("driveBackup.hideDetails") : t("driveBackup.showDetails")}
            </Text>
          </TouchableRipple>
          {showDetails && (
            <ScrollView style={styles.details}>
              <Text selectable variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {details.join("\n")}
              </Text>
            </ScrollView>
          )}
        </>
      )}

      <ModalActions confirmLabel={t("common.ok")} onConfirm={dismissBackupResult} />
    </>
  );
}

function FailureLine({ failure }: { failure: BackupFailure }) {
  const theme = useTheme();
  const { t } = useI18n();
  return (
    <Text variant="bodySmall" style={[styles.failureLine, { color: theme.colors.onSurfaceVariant }]}>
      {failure.label ? `${failure.label}: ` : ""}
      {t(failure.reasonKey, failure.reasonParams)}
    </Text>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", padding: 24 },
  card: { padding: 24, maxHeight: "85%" },
  body: { marginTop: 12 },
  bar: { height: 6, borderRadius: 3, marginTop: 16, marginBottom: 12 },
  cancellingRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16 },
  failures: { marginTop: 12, maxHeight: 160 },
  failureLine: { marginBottom: 4 },
  detailsToggle: { alignSelf: "flex-start", paddingVertical: 8, marginTop: 4 },
  details: { maxHeight: 120, marginBottom: 8 },
});
