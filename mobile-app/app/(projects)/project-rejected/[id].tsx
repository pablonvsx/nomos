// src/app/project-rejected/[id].tsx
// Rejected points area for a project's owner (COLLAB_MODEL_V2_REFERENCE.md
// section 7). Purely local SQL, no Drive/Google account involvement -
// rejected points are never auto-purged, they stay here until the owner
// explicitly deletes them (or reconsiders one back to pending). Permanent
// deletion cleans up the point's media files first (photos/audio_notes plus
// anything embedded in custom-protocol module fields), reusing the exact
// same deletePointEnvelopeMediaFiles logic already used by
// resolve-duplicates.ts's 'discard' outcome, before calling deletePoint
// (db/queries/points.ts), which only removes the database rows.
import React, { useState, useCallback } from "react";
import { View, StyleSheet, FlatList, RefreshControl } from "react-native";
import {
  Text,
  Card,
  Button,
  ActivityIndicator,
  useTheme as usePaperTheme,
} from "react-native-paper";
import { useRouter, useLocalSearchParams, useFocusEffect, Stack } from "expo-router";
import { useAlertDialog } from "@/hooks/use-dialog";
import { useI18n } from "@/contexts/i18n-context";
import { useProtocolRegistry } from "@/contexts/protocol-registry-context";
import { getProjectById } from "@/db/queries/projects";
import { getRejectedPointsByProject, updatePointApprovalStatus, deletePoint, getPoint } from "@/db/queries/points";
import { getPointDisplayLabel } from "@/core/drive-sync/point-label";
import { buildPointWithModules, buildPointEnvelope } from "@/db/mappers/point.mapper";
import { deletePointEnvelopeMediaFiles } from "@/core/project-sharing/module-media";
import type { Project, Point } from "@/types/database";

export default function ProjectRejectedScreen() {
  const router = useRouter();
  const paperTheme = usePaperTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { alert, confirm } = useAlertDialog();
  const { t } = useI18n();
  const registry = useProtocolRegistry();

  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rejectedPoints, setRejectedPoints] = useState<Point[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const projectData = await getProjectById(parseInt(id));
      if (!projectData) {
        alert(t("common.error"), t("projectView.projectNotFound"));
        router.back();
        return;
      }

      setProject(projectData);
      const rejected = await getRejectedPointsByProject(projectData.id);
      setRejectedPoints(rejected);
    } catch (error) {
      console.error("Error loading rejected points:", error);
      alert(t("common.error"), t("projectRejected.loadError"));
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [id, router, t]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleDelete = (point: Point) => {
    confirm(
      t("projectRejected.deleteTitle"),
      t("projectRejected.deleteConfirm"),
      async () => {
        setProcessingId(point.id);
        try {
          if (project) {
            const result = await getPoint(point.id);
            if (result) {
              const pointWithModules = buildPointWithModules(result.point, result.modules, registry);
              const envelope = buildPointEnvelope(pointWithModules);
              await deletePointEnvelopeMediaFiles(envelope, project);
            }
          }
          await deletePoint(point.id);
          setRejectedPoints((prev) => prev.filter((p) => p.id !== point.id));
        } catch (error) {
          console.error("Error deleting rejected point:", error);
          alert(t("common.error"), t("projectRejected.deleteError"));
        } finally {
          setProcessingId(null);
        }
      },
      () => {},
      t("common.delete"),
      t("common.cancel"),
      true,
    );
  };

  const handleReconsider = async (point: Point) => {
    setProcessingId(point.id);
    try {
      await updatePointApprovalStatus(point.id, "pending");
      setRejectedPoints((prev) => prev.filter((p) => p.id !== point.id));
    } catch (error) {
      console.error("Error reconsidering point:", error);
      alert(t("common.error"), t("projectRejected.reconsiderError"));
    } finally {
      setProcessingId(null);
    }
  };

  const renderItem = ({ item }: { item: Point }) => {
    const isProcessing = processingId === item.id;
    const pointDisplayLabel = getPointDisplayLabel({
      pointNumber: item.point_number,
      createdBy: item.created_by ?? null,
    });

    return (
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={{ fontWeight: "bold" }}>
            {item.generated_name || t("surveyView.point") + " " + pointDisplayLabel}
          </Text>
          {item.rejection_reason && (
            <Text variant="bodySmall" style={{ color: paperTheme.colors.error, marginTop: 4 }}>
              {t("surveyView.rejectionReasonLabel")}: {item.rejection_reason}
            </Text>
          )}
        </Card.Content>
        <Card.Actions>
          <Button
            mode="outlined"
            disabled={processingId !== null}
            onPress={() => handleReconsider(item)}
          >
            {t("projectRejected.reconsider")}
          </Button>
          <Button
            mode="contained"
            buttonColor={paperTheme.colors.error}
            textColor={paperTheme.colors.onError}
            loading={isProcessing}
            disabled={processingId !== null}
            onPress={() => handleDelete(item)}
          >
            {t("projectRejected.deletePermanently")}
          </Button>
        </Card.Actions>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: paperTheme.colors.background }]}>
        <Stack.Screen options={{ title: t("projectRejected.title"), headerBackTitle: "" }} />
        <ActivityIndicator animating size="large" />
      </View>
    );
  }

  if (!project) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: paperTheme.colors.background }]}>
        <Stack.Screen options={{ title: t("projectRejected.title"), headerBackTitle: "" }} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: paperTheme.colors.background }]}>
      <Stack.Screen options={{ title: t("projectRejected.title"), headerBackTitle: "" }} />

      <FlatList
        data={rejectedPoints}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={{ color: paperTheme.colors.secondary }}>
              {t("projectRejected.empty")}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContent: { justifyContent: "center", alignItems: "center" },
  content: { flexGrow: 1, padding: 16 },
  card: { marginBottom: 16 },
  emptyState: { padding: 40, alignItems: "center" },
});
