import React, { useEffect, useReducer, useState } from "react";
import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { ActivityIndicator, ProgressBar, Text, TouchableRipple, useTheme } from "react-native-paper";
import { BackupActivityLog } from "@/components/drive-sync/BackupActivityLog";
import { ModalActions } from "@/components/ui/ModalActions";
import { MODAL_TITLE_STYLE } from "@/constants/modal-title";
import { MODAL_FOOTER_GAP_BELOW, MODAL_PADDING_H, MODAL_PADDING_TOP, MODAL_TITLE_GAP } from "@/constants/modal-layout";
import { MODAL_SHAPE_STYLE } from "@/constants/shape";
import { useI18n } from "@/contexts/i18n-context";
import {
  dismissBackupResult,
  requestBackupCancel,
  type BackupResult,
  type BackupSessionScope,
} from "@/core/drive-sync/backup-session";
import { failureHeading } from "@/core/drive-sync/backup-labels";
import {
  deriveBackupModalView,
  initialBackupModalUi,
  modalCopyKeys,
  reduceBackupModal,
  resultCopy,
} from "@/core/ui/backup-modal-state";
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

  const scope = session.phase === "idle" || session.phase === "checking" ? "points" : session.scope;
  const copy = modalCopyKeys(scope);
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
              <View style={styles.content}>
                <Text style={[MODAL_TITLE_STYLE, { color: theme.colors.onSurface }]}>{t(copy.title)}</Text>
                <Text variant="bodyMedium" style={[styles.body, { color: theme.colors.onSurface }]}>
                  {stageText}
                </Text>
                <ProgressBar
                  progress={view.progress ?? 0}
                  indeterminate={view.progress === null}
                  color={theme.colors.primary}
                  style={styles.bar}
                />
                <BackupActivityLog log={session.phase === "running" ? session.log : []} />
                <Text variant="bodySmall" style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>
                  {t("driveBackup.keepAppOpen")}
                </Text>
              </View>
              <ModalActions
                confirmLabel={t("common.cancel")}
                confirmVariant="outline"
                onConfirm={() => dispatch({ type: "backPressed" })}
              />
            </>
          )}

          {view.kind === "confirmingCancel" && (
            <>
              <View style={styles.content}>
                  <Text style={[MODAL_TITLE_STYLE, { color: theme.colors.onSurface }]}>
                    {t(copy.cancelTitle)}
                  </Text>
                  <Text variant="bodyMedium" style={[styles.body, { color: theme.colors.onSurface }]}>
                    {t(copy.cancelMessage)}
                  </Text>
              </View>
              <ModalActions
                cancelLabel={t(copy.keepGoing)}
                onCancel={() => dispatch({ type: "keepGoing" })}
                confirmLabel={t(copy.cancelConfirm)}
                onConfirm={() => {
                  dispatch({ type: "cancelConfirmed" });
                  requestBackupCancel();
                }}
                destructive
              />
            </>
          )}

          {view.kind === "cancelling" && (
            // No footer here, so this state closes the card with the footer's own bottom gap.
            <View style={[styles.content, styles.contentNoFooter]}>
              <Text style={[MODAL_TITLE_STYLE, { color: theme.colors.onSurface }]}>{t(copy.title)}</Text>
              <View style={styles.cancellingRow}>
                <ActivityIndicator size={20} />
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, flex: 1 }}>
                  {t("driveBackup.cancelling")}
                </Text>
              </View>
            </View>
          )}

          {view.kind === "finished" && <FinishedContent scope={scope} result={view.result} />}
        </View>
      </View>
    </Modal>
  );
}

function FinishedContent({ scope, result }: { scope: BackupSessionScope; result: BackupResult }) {
  const theme = useTheme();
  const { t } = useI18n();
  const [showDetails, setShowDetails] = useState(false);

  const copy = resultCopy(scope, result);
  const title = t(copy.titleKey);
  let message = t(copy.messageKey, copy.params);
  // Incomplete: counts plus, at most, the reason most items share. Item by item is in the details.
  if (copy.reason) message += `\n${t(copy.reason.key, copy.reason.params)}`;

  const details = failureDetailLines(result, t);

  return (
    <>
      <View style={styles.content}>
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
      </View>

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
  // The card has no padding of its own: the content carries the sides and the top, and the
  // ModalActions footer owns the space around the buttons (and below them).
  card: { maxHeight: "85%", overflow: "hidden" },
  content: { paddingHorizontal: MODAL_PADDING_H, paddingTop: MODAL_PADDING_TOP },
  contentNoFooter: { paddingBottom: MODAL_FOOTER_GAP_BELOW },
  body: { marginTop: MODAL_TITLE_GAP },
  hint: { marginTop: 12 },
  bar: { height: 6, borderRadius: 3, marginTop: 16, marginBottom: 12 },
  cancellingRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16 },
  detailsToggle: { alignSelf: "flex-start", paddingVertical: 8, marginTop: 4 },
  details: { maxHeight: 120 },
});
