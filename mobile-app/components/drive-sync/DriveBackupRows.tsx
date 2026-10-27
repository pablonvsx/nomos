import React from "react";
import { StyleSheet, View } from "react-native";
import { Button, Icon, Text, useTheme } from "react-native-paper";
import { BUTTON_RADIUS } from "@/constants/shape";
import { useI18n } from "@/contexts/i18n-context";
import { backupStatusText, isBackupActionEnabled } from "@/core/drive-sync/backup-status-text";
import type { BackupStatus } from "@/core/drive-sync/change-detection";

interface Props {
  projectStatus: BackupStatus | null;
  pointsStatus: BackupStatus | null;
  /** A backup is running (or its result is still on screen): no new one can start. */
  busy: boolean;
  onBackupProject: () => void;
  onBackupPoints: () => void;
}

export function formatBackupDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/**
 * Owner-only "Backup no Drive" block, shown inside BackupCollaborationCard:
 * one row per backup scope, with its status and its button.
 */
export function DriveBackupRows({ projectStatus, pointsStatus, busy, onBackupProject, onBackupPoints }: Props) {
  const theme = useTheme();
  const { t } = useI18n();

  const rows = [
    { icon: "folder-cog-outline", title: t("driveBackup.scopeProject"), status: projectStatus, onPress: onBackupProject },
    { icon: "map-marker-multiple-outline", title: t("driveBackup.scopePoints"), status: pointsStatus, onPress: onBackupPoints },
  ];

  return (
    <View>
      <Text variant="titleSmall" style={styles.title}>
        {t("driveBackup.cardTitle")}
      </Text>
      {rows.map((row) => {
        const text = backupStatusText(row.status, formatBackupDate);
        return (
          <View key={row.title} style={styles.row}>
            <View style={styles.rowInfo}>
              <View style={styles.rowTitle}>
                <Icon source={row.icon} size={18} color={theme.colors.onSurfaceVariant} />
                <Text variant="labelLarge">{row.title}</Text>
              </View>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {t(text.key, text.params)}
              </Text>
            </View>
            <Button
              mode="outlined"
              compact
              onPress={row.onPress}
              disabled={busy || !isBackupActionEnabled(row.status)}
              style={{ borderRadius: BUTTON_RADIUS }}
            >
              {t("driveBackup.backupButton")}
            </Button>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontWeight: "bold" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 12 },
  rowInfo: { flex: 1, gap: 2 },
  rowTitle: { flexDirection: "row", alignItems: "center", gap: 6 },
});
