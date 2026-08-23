// mobile-app/app/(projects)/protocol/tutorials.tsx
import React, { useState } from "react";
import { View, ScrollView, StyleSheet, Pressable } from "react-native";
import { Text, Card, Button, Portal, Dialog, Icon, Divider, useTheme } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useI18n } from "@/contexts/i18n-context";
import { useProtocolRegistry } from "@/contexts/protocol-registry-context";
import { PROTOCOL_TUTORIALS, TutorialSection } from "@/constants/protocol-tutorials";
import type { ProtocolManifest } from "@/protocol-kernel/types";
import { BUTTON_RADIUS } from "@/constants/shape";
import { useBottomContentPadding } from "@/hooks/use-bottom-content-padding";

// Same Dialog + Portal picker pattern as native-catalog.tsx's
// ProtocolSelectionDialog (react-native-paper's Menu fails to reopen a
// second time in this app - see the comment there for the full story).
function ProtocolSelectionDialog({
  visible,
  onDismiss,
  manifests,
  selectedId,
  onSelect,
  lang,
  theme,
  t,
}: {
  visible: boolean;
  onDismiss: () => void;
  manifests: ProtocolManifest[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  lang: string;
  theme: any;
  t: (key: string) => string;
}) {
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={{ maxHeight: "70%" }}>
        <Dialog.Title style={{ fontSize: 16 }} numberOfLines={1}>
          {t("tutorials.selectProtocol")}
        </Dialog.Title>
        <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
          <ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
            {manifests.map((manifest) => {
              const isSelected = selectedId === manifest.id;
              return (
                <Pressable
                  key={manifest.id}
                  onPress={() => onSelect(manifest.id)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 10,
                    paddingHorizontal: 20,
                    backgroundColor: isSelected ? theme.colors.primaryContainer : "transparent",
                  }}
                >
                  <Text
                    variant="bodyMedium"
                    style={{
                      flex: 1,
                      color: isSelected ? theme.colors.primary : theme.colors.onSurface,
                      fontWeight: isSelected ? "600" : "400",
                    }}
                  >
                    {manifest.name[lang] ?? manifest.name["pt"] ?? manifest.id}
                  </Text>
                  {isSelected && <Icon source="check" size={18} color={theme.colors.primary} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onDismiss}>{t("common.close")}</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

function TutorialSectionCard({
  section,
  lang,
  theme,
}: {
  section: TutorialSection;
  lang: string;
  theme: any;
}) {
  return (
    <Card mode="outlined" style={styles.sectionCard}>
      <Card.Content>
        <View style={styles.sectionHeaderRow}>
          <MaterialCommunityIcons name={section.icon as any} size={24} color={theme.colors.primary} />
          <Text variant="titleLarge" style={[styles.sectionTitle, { color: theme.colors.primary }]}>
            {section.title[lang] ?? section.title["pt"]}
          </Text>
        </View>

        {section.intro && (
          <Text variant="bodyMedium" style={[styles.intro, { color: theme.colors.onSurface }]}>
            {section.intro[lang] ?? section.intro["pt"]}
          </Text>
        )}

        <Divider style={styles.sectionDivider} />

        {section.steps.map((step, index) => (
          <View key={index}>
            <View style={styles.stepRow}>
              <MaterialCommunityIcons
                name={step.icon as any}
                size={20}
                color={theme.colors.secondary}
                style={styles.stepIcon}
              />
              <View style={{ flex: 1 }}>
                <Text variant="titleMedium" style={[styles.stepTitle, { color: theme.colors.onSurface }]}>
                  {step.title[lang] ?? step.title["pt"]}
                </Text>
                <Text
                  variant="bodyMedium"
                  style={[styles.stepDescription, { color: theme.colors.onSurface }]}
                >
                  {step.description[lang] ?? step.description["pt"]}
                </Text>
              </View>
            </View>
            {index < section.steps.length - 1 && <Divider style={styles.stepDivider} />}
          </View>
        ))}
      </Card.Content>
    </Card>
  );
}

export default function TutorialsScreen() {
  const theme = useTheme();
  const { t, currentLanguage } = useI18n();
  const bottomPadding = useBottomContentPadding();
  const registry = useProtocolRegistry();
  const { protocolId } = useLocalSearchParams<{ protocolId?: string }>();
  const lang = (currentLanguage as string) ?? "pt";

  const manifests = registry.listProtocols();
  const [selectedId, setSelectedId] = useState(
    manifests.some((m) => m.id === protocolId) ? protocolId : manifests[0]?.id,
  );
  const [selectionDialogVisible, setSelectionDialogVisible] = useState(false);

  const selected = manifests.find((m) => m.id === selectedId);
  const tutorial = selected ? PROTOCOL_TUTORIALS[selected.id] : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ title: t("tutorials.title") }} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: bottomPadding },
        ]}
      >
        {manifests.length === 0 ? (
          <Text variant="bodyMedium" style={{ color: theme.colors.secondary }}>
            {t("newProject.noProtocolsAvailable")}
          </Text>
        ) : (
          <>
            <Button
              mode="outlined"
              icon="chevron-down"
              contentStyle={{ flexDirection: "row-reverse", justifyContent: "space-between" }}
              onPress={() => setSelectionDialogVisible(true)}
              style={[styles.selector, { borderRadius: BUTTON_RADIUS }]}
            >
              {selected?.name[lang] ?? selected?.name["pt"] ?? selected?.id}
            </Button>

            {selectionDialogVisible && (
              <ProtocolSelectionDialog
                visible={selectionDialogVisible}
                onDismiss={() => setSelectionDialogVisible(false)}
                manifests={manifests}
                selectedId={selectedId}
                onSelect={(id) => {
                  setSelectedId(id);
                  setSelectionDialogVisible(false);
                }}
                lang={lang}
                theme={theme}
                t={t}
              />
            )}

            {selected &&
              (tutorial ? (
                tutorial.sections.map((section, index) => (
                  <TutorialSectionCard key={index} section={section} lang={lang} theme={theme} />
                ))
              ) : (
                <Card mode="outlined" style={styles.sectionCard}>
                  <Card.Content>
                    <Text variant="bodyMedium" style={{ color: theme.colors.secondary }}>
                      {t("tutorials.pending")}
                    </Text>
                  </Card.Content>
                </Card>
              ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
  },
  selector: {
    marginBottom: 16,
  },
  sectionCard: {
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  sectionTitle: {
    fontWeight: "bold",
    flex: 1,
  },
  intro: {
    marginTop: 12,
    textAlign: "justify",
  },
  sectionDivider: {
    marginVertical: 16,
  },
  stepRow: {
    flexDirection: "row",
    paddingVertical: 10,
    gap: 10,
  },
  stepIcon: {
    marginTop: 2,
  },
  stepTitle: {
    fontWeight: "600",
    marginBottom: 4,
  },
  stepDescription: {
    lineHeight: 20,
    textAlign: "justify",
  },
  stepDivider: {
    marginVertical: 4,
  },
});
