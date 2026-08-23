// mobile-app/app/(projects)/protocol/native-catalog.tsx
import React, { useState } from "react";
import { View, ScrollView, StyleSheet, Pressable } from "react-native";
import { Text, Card, Button, Portal, Dialog, Icon, Divider, Surface, useTheme } from "react-native-paper";
import { Stack, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useI18n } from "@/contexts/i18n-context";
import { useProtocolRegistry } from "@/contexts/protocol-registry-context";
import { NATIVE_PROTOCOLS_CATALOG } from "@/constants/native-protocols-catalog";
import type { ProtocolManifest } from "@/protocol-kernel/types";
import { BUTTON_RADIUS } from "@/constants/shape";
import { useBottomContentPadding } from "@/hooks/use-bottom-content-padding";

// Own Dialog + own Portal, mounted only while open - same pattern used in
// protocol/builder.tsx (TypeSelectionDialog/UnitSelectionDialog). A Menu
// anchored to the selector button was tried first (like this screen used to
// have) but react-native-paper's Menu fails to reopen a second time in this
// app (measure/animation retry loop never resolves after the first close) -
// a dedicated Dialog with a plain Pressable list sidesteps that entirely.
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
          {t("protocol.selectNativeProtocol")}
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

// Own Dialog + own Portal, mounted only while open - same convention as
// ProtocolSelectionDialog above. The "copied" confirmation is a local state
// swap on the button itself, not a Snackbar - a Paper Snackbar rendered at
// the app root (its own Portal) would end up behind this Dialog's Portal
// layer (see the same pitfall documented in components/survey/SpeciesInput.tsx).
function PracticalGuideDialog({
  visible,
  onDismiss,
  url,
  theme,
  t,
}: {
  visible: boolean;
  onDismiss: () => void;
  url: string;
  theme: any;
  t: (key: string) => string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>{t("tutorials.practicalGuideTitle")}</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium" style={{ marginBottom: 16, textAlign: "justify" }}>
            {t("tutorials.practicalGuideDescription")}
          </Text>

          <Surface
            style={[styles.linkBox, { backgroundColor: theme.colors.surfaceVariant }]}
            elevation={0}
          >
            <Text variant="bodySmall" selectable style={{ color: theme.colors.onSurfaceVariant }}>
              {url}
            </Text>
          </Surface>

          <Button
            mode="outlined"
            icon={copied ? "check" : "content-copy"}
            style={[styles.copyButton, { borderRadius: BUTTON_RADIUS }]}
            onPress={handleCopy}
          >
            {copied ? t("tutorials.linkCopied") : t("tutorials.copyLink")}
          </Button>

          <Surface
            style={[styles.tipBox, { backgroundColor: theme.colors.tertiaryContainer }]}
            elevation={0}
          >
            <Icon source="information-outline" size={20} color={theme.colors.onTertiaryContainer} />
            <Text
              variant="bodySmall"
              style={{
                color: theme.colors.onTertiaryContainer,
                flex: 1,
                marginLeft: 8,
                textAlign: "justify",
              }}
            >
              {t("tutorials.openOnDesktopTip")}
            </Text>
          </Surface>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss}>{t("common.close")}</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

export default function NativeProtocolCatalogScreen() {
  const theme = useTheme();
  const { t, currentLanguage } = useI18n();
  const bottomPadding = useBottomContentPadding();
  const router = useRouter();
  const registry = useProtocolRegistry();
  const lang = (currentLanguage as string) ?? "pt";

  const manifests = registry.listProtocols().filter((p) => p.kind !== "custom");
  const [selectedId, setSelectedId] = useState(manifests[0]?.id);
  const [selectionDialogVisible, setSelectionDialogVisible] = useState(false);
  const [practicalGuideVisible, setPracticalGuideVisible] = useState(false);

  const selected = manifests.find((m) => m.id === selectedId);
  const catalogEntry = selected ? NATIVE_PROTOCOLS_CATALOG[selected.id] : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ title: t("protocol.nativeProtocolsTitle") }} />
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

            {selected && (
              <View style={styles.tutorialButtonsRow}>
                <Button
                  mode="contained-tonal"
                  icon="school-outline"
                  style={[styles.tutorialButton, { borderRadius: BUTTON_RADIUS }]}
                  onPress={() =>
                    router.push(`/protocol/tutorials?protocolId=${selected.id}` as any)
                  }
                >
                  {t("tutorials.howToUse")}
                </Button>

                {catalogEntry?.structuredTutorialUrl && (
                  <Button
                    mode="contained-tonal"
                    icon="google-drive"
                    style={[styles.tutorialButton, { borderRadius: BUTTON_RADIUS }]}
                    onPress={() => setPracticalGuideVisible(true)}
                  >
                    {t("tutorials.accessPracticalGuide")}
                  </Button>
                )}
              </View>
            )}

            {practicalGuideVisible && catalogEntry?.structuredTutorialUrl && (
              <PracticalGuideDialog
                visible={practicalGuideVisible}
                onDismiss={() => setPracticalGuideVisible(false)}
                url={catalogEntry.structuredTutorialUrl}
                theme={theme}
                t={t}
              />
            )}

            {selected && (
              <Card mode="outlined" style={styles.card}>
                <Card.Content>
                  <Text variant="titleLarge" style={{ fontWeight: "bold" }}>
                    {selected.name[lang] ?? selected.name["pt"] ?? selected.id}
                  </Text>

                  {selected.theme?.[lang] && (
                    <Text
                      variant="bodyMedium"
                      style={{ color: theme.colors.secondary, marginTop: 4 }}
                    >
                      {selected.theme[lang]}
                    </Text>
                  )}

                  {selected.description[lang] && (
                    <Text variant="bodyMedium" style={{ marginTop: 16, textAlign: "justify" }}>
                      {selected.description[lang]}
                    </Text>
                  )}

                  <Divider style={{ marginVertical: 16 }} />

                  <Text variant="titleMedium" style={{ marginBottom: 8 }}>
                    {t("protocol.nativeCatalogWorkflow")}
                  </Text>
                  <Text variant="bodyMedium" style={{ textAlign: "justify" }}>
                    {catalogEntry?.workflow[lang] ??
                      catalogEntry?.workflow["pt"] ??
                      t("protocol.nativeCatalogPending")}
                  </Text>

                  <Divider style={{ marginVertical: 16 }} />

                  <Text variant="titleMedium" style={{ marginBottom: 8 }}>
                    {t("protocol.nativeCatalogModules")}
                  </Text>
                  {selected.modules.map((module) => {
                    const moduleEntry = catalogEntry?.modules.find((m) => m.id === module.id);
                    return (
                      <View key={module.id} style={{ marginBottom: 12 }}>
                        <Text variant="bodyLarge" style={{ fontWeight: "600" }}>
                          {module.title[lang] ?? module.title["pt"] ?? module.id}
                        </Text>
                        <Text
                          variant="bodyMedium"
                          style={{
                            color: theme.colors.secondary,
                            marginTop: 2,
                            textAlign: "justify",
                          }}
                        >
                          {moduleEntry?.description[lang] ??
                            moduleEntry?.description["pt"] ??
                            t("protocol.nativeCatalogPending")}
                        </Text>
                      </View>
                    );
                  })}
                </Card.Content>
              </Card>
            )}
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
  tutorialButtonsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  tutorialButton: {
    flex: 1,
  },
  card: {
    marginBottom: 16,
  },
  linkBox: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  copyButton: {
    alignSelf: "flex-start",
    marginBottom: 16,
  },
  tipBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 8,
    padding: 12,
  },
});
