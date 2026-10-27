import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Card, Divider, Icon, Text, useTheme } from "react-native-paper";
import { DriveBackupRows, formatBackupDate } from "@/components/drive-sync/DriveBackupRows";
import { BUTTON_RADIUS } from "@/constants/shape";
import { useI18n } from "@/contexts/i18n-context";
import { backupSummaryText, getPendingQueueBadge } from "@/core/drive-sync/backup-summary";
import type { BackupStatus } from "@/core/drive-sync/change-detection";

const MIN_TOUCH_SIZE = 48;

interface Props {
  projectStatus: BackupStatus | null;
  pointsStatus: BackupStatus | null;
  /** A backup is running (or its result is still on screen): no new one can start. */
  busy: boolean;
  onBackupProject: () => void;
  onBackupPoints: () => void;
  pendingCount: number;
  rejectedCount: number;
  showPendingApprovals: boolean;
  showRejectedPoints: boolean;
  onOpenPendingApprovals: () => void;
  onOpenRejectedPoints: () => void;
}

/**
 * Owner-only card that groups the Drive backup block and the point queue
 * (pending approvals, rejected points). It only presents: the screen owns the
 * backup operation, the handlers and the counts. Both levels start collapsed
 * every time the screen mounts; the open state is local and never persisted.
 */
export function BackupCollaborationCard({
  projectStatus,
  pointsStatus,
  busy,
  onBackupProject,
  onBackupPoints,
  pendingCount,
  rejectedCount,
  showPendingApprovals,
  showRejectedPoints,
  onOpenPendingApprovals,
  onOpenRejectedPoints,
}: Props) {
  const theme = useTheme();
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [queueExpanded, setQueueExpanded] = useState(false);

  const title = t("backupCollaboration.title");
  const summary = backupSummaryText(projectStatus, pointsStatus, formatBackupDate);
  const summaryLabel = t(summary.key, summary.params);
  const badge = showPendingApprovals ? getPendingQueueBadge(pendingCount) : null;
  const badgeLabel = badge ? t(badge.key, badge.params) : null;
  const showQueue = showPendingApprovals || showRejectedPoints;
  const queueTitle = t("backupCollaboration.queueTitle");
  const queueCount = showPendingApprovals ? pendingCount : 0;

  const headerLabel = expanded ? title : [title, summaryLabel, badgeLabel].filter(Boolean).join(". ");
  const queueLabel = !queueExpanded && queueCount > 0 ? `${queueTitle}. ${queueCount}` : queueTitle;

  return (
    <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
      <Card.Content>
        <Pressable
          onPress={() => setExpanded((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={headerLabel}
          style={styles.header}
        >
          <View style={styles.headerText}>
            <View style={styles.headerTitleRow}>
              <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                <Icon source="cloud-outline" size={20} color={theme.colors.onSurface} />
              </View>
              <Text variant="titleMedium" style={styles.title}>
                {title}
              </Text>
            </View>
            {!expanded && (
              <View style={styles.summaryRow}>
                <Text variant="bodySmall" style={[styles.summary, { color: theme.colors.onSurfaceVariant }]}>
                  {summaryLabel}
                </Text>
                {badgeLabel && (
                  <View style={[styles.badge, { backgroundColor: theme.colors.secondaryContainer }]}>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSecondaryContainer }}>
                      {badgeLabel}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
          <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <Icon source={expanded ? "chevron-up" : "chevron-down"} size={24} color={theme.colors.onSurfaceVariant} />
          </View>
        </Pressable>

        {expanded && (
          <>
            <Divider style={styles.divider} />
            <DriveBackupRows
              projectStatus={projectStatus}
              pointsStatus={pointsStatus}
              busy={busy}
              onBackupProject={onBackupProject}
              onBackupPoints={onBackupPoints}
            />

            {showQueue && (
              <>
                <Divider style={styles.divider} />
                <Pressable
                  onPress={() => setQueueExpanded((value) => !value)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: queueExpanded }}
                  accessibilityLabel={queueLabel}
                  style={styles.queueHeader}
                >
                  <View style={styles.headerTitleRow}>
                    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                      <Icon source="format-list-bulleted" size={18} color={theme.colors.onSurfaceVariant} />
                    </View>
                    <Text variant="titleSmall" style={styles.title}>
                      {queueTitle}
                    </Text>
                    {!queueExpanded && queueCount > 0 && (
                      <View style={[styles.badge, { backgroundColor: theme.colors.secondaryContainer }]}>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSecondaryContainer }}>
                          {queueCount}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                    <Icon source={queueExpanded ? "chevron-up" : "chevron-down"} size={24} color={theme.colors.onSurfaceVariant} />
                  </View>
                </Pressable>

                {queueExpanded && (
                  <View>
                    {showPendingApprovals && (
                      <QueueRow
                        label={`${t("pointApproval.pendingApprovalsTitle")} (${pendingCount})`}
                        onPress={onOpenPendingApprovals}
                      />
                    )}
                    {showRejectedPoints && (
                      <QueueRow
                        label={`${t("pointApproval.rejectedPointsTitle")} (${rejectedCount})`}
                        onPress={onOpenRejectedPoints}
                      />
                    )}
                  </View>
                )}
              </>
            )}
          </>
        )}
      </Card.Content>
    </Card>
  );
}

function QueueRow({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.queueRow}>
      <Text variant="bodyLarge" style={styles.queueRowLabel}>
        {label}
      </Text>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Icon source="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: MIN_TOUCH_SIZE, gap: 8 },
  headerText: { flex: 1, gap: 4 },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  title: { fontWeight: "bold", flexShrink: 1 },
  summaryRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  summary: { flexShrink: 1 },
  badge: { borderRadius: BUTTON_RADIUS, paddingHorizontal: 8, paddingVertical: 2 },
  divider: { marginVertical: 12 },
  queueHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: MIN_TOUCH_SIZE, gap: 8 },
  queueRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: MIN_TOUCH_SIZE, gap: 8 },
  queueRowLabel: { flex: 1 },
});
