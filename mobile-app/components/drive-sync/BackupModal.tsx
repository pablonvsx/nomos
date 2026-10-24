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
  type BackupResult,
} from "@/core/drive-sync/backup-session";
import { failureHeading } from "@/core/drive-sync/backup-labels";
import { predominantReason } from "@/core/drive-sync/backup-results";
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
  // No connection at all reads the same as the pre-flight dialog: "Sem conexão", nothing was sent.
  const offline = result.outcome === "error" && result.error?.reasonKey === "driveBackup.reason.offline";

  const title = offline ? t("driveBackup.preflight.offline.title") : t(`driveBackup.result.${result.outcome}.title`);

  let message: string;
  if (offline) {
    message = t("driveBackup.preflight.offline.message");
  } else if (result.outcome === "error") {
    message = t(result.error?.reasonKey ?? "driveBackup.reason.unknown", result.error?.reasonParams);
  } else if (result.outcome === "completed" && result.sent === 0) {
    message = t("driveBackup.result.completedNothing.message");
  } else {
    message = t(`driveBackup.result.${result.outcome}.message`, params);
    // Incomplete: counts plus, at most, the reason most items share. Item by item is in the details.
    const predominant = result.outcome === "incomplete" ? predominantReason(result.failures) : null;
    if (predominant) message += `\n${t(predominant.reasonKey, predominant.reasonParams)}`;
  }

  const details = failureDetailLines(result, t);

  return (
    <>
      <Text style={[MODAL_TITLE_STYLE, { color: theme.colors.onSurface }]}>{title}</Text>
      <Text variant="bodyMedium" style={[styles.body, { color: theme.colors.onSurface }]}>
        {message}
      </Text>

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
                {details.join("\n\n")}
              </Text>
            </ScrollView>
          )}
        </>
      )}

      <ModalActions confirmLabel={t("common.ok")} onConfirm={dismissBackupResult} />
    </>
  );
}

/** One block per failed item: its name, the reason in plain words, then the technical text. */
function failureDetailLines(result: BackupResult, t: (key: string, params?: Record<string, string>) => string): string[] {
  const lines = result.failures.map((failure) => {
    const head = `${failureHeading(failure, t)}: `;
    const technical = failure.detail ? `\n${failure.detail}` : "";
    return `${head}${t(failure.reasonKey, failure.reasonParams)}${technical}`;
  });
  if (lines.length === 0 && result.error?.detail) lines.push(result.error.detail);
  return lines;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "center", padding: 24 },
  card: { padding: 24, maxHeight: "85%" },
  body: { marginTop: 12 },
  bar: { height: 6, borderRadius: 3, marginTop: 16, marginBottom: 12 },
  cancellingRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16 },
  detailsToggle: { alignSelf: "flex-start", paddingVertical: 8, marginTop: 4 },
  details: { maxHeight: 120, marginBottom: 8 },
});
