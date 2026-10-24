import React from "react";
import { StyleSheet, View } from "react-native";
import { Button, Card, Divider, Icon, Text, useTheme } from "react-native-paper";
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

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/** Owner-only card: one row per backup scope, with its status and its button. */
export function DriveBackupCard({ projectStatus, pointsStatus, busy, onBackupProject, onBackupPoints }: Props) {
  const theme = useTheme();
  const { t } = useI18n();

  const rows = [
    { icon: "folder-cog-outline", title: t("driveBackup.scopeProject"), status: projectStatus, onPress: onBackupProject },
    { icon: "map-marker-multiple-outline", title: t("driveBackup.scopePoints"), status: pointsStatus, onPress: onBackupPoints },
  ];

  return (
    <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
      <Card.Content>
        <Text variant="titleMedium" style={styles.title}>
          {t("driveBackup.cardTitle")}
        </Text>
        <Divider style={styles.divider} />
        {rows.map((row, index) => {
          const text = backupStatusText(row.status, formatDate);
          return (
            <View key={row.title} style={[styles.row, index > 0 && styles.rowSpaced]}>
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
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 16 },
  title: { fontWeight: "bold" },
  divider: { marginVertical: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowSpaced: { marginTop: 12 },
  rowInfo: { flex: 1, gap: 2 },
  rowTitle: { flexDirection: "row", alignItems: "center", gap: 6 },
});
