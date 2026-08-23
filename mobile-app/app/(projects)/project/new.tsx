import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import {
  TextInput,
  Button,
  Text,
  Chip,
  RadioButton,
  ActivityIndicator,
  useTheme as usePaperTheme,
  Divider,
} from "react-native-paper";
import { useRouter, Stack } from "expo-router";
import { useAlertDialog } from "@/hooks/use-dialog";
import { useScrollToInput } from "@/hooks/use-scroll-to-input";
import { useI18n } from "@/contexts/i18n-context";
import { useProtocolRegistry } from "@/contexts/protocol-registry-context";
import { useBottomContentPadding } from "@/hooks/use-bottom-content-padding";

import { getAllCustomProtocols } from "@/db/queries/custom-protocols";
import { createProject } from "@/db/queries/projects";
import type { CustomProtocol } from "@/types/database";
import type { ProtocolManifest } from "@/protocol-kernel/types";

// selectedKey format: "scientific:<manifestId>" | "custom:<dbId>"
type SelectionSource = "scientific" | "custom";

export default function NewProjectScreen() {
  const router = useRouter();
  const paperTheme = usePaperTheme();
  const bottomPadding = useBottomContentPadding();
  const { alert } = useAlertDialog();
  const { t, currentLanguage } = useI18n();
  const registry = useProtocolRegistry();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedKey, setSelectedKey] = useState<string>("");

  const [scientificManifests, setScientificManifests] = useState<ProtocolManifest[]>([]);
  const [customProtocols, setCustomProtocols] = useState<CustomProtocol[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const manifests = registry.listProtocols().filter((p) => p.kind !== "custom");
      const custom = await getAllCustomProtocols();
      setScientificManifests(manifests);
      setCustomProtocols(custom);

      if (manifests.length > 0) {
        setSelectedKey(`scientific:${manifests[0].id}`);
      } else if (custom.length > 0) {
        setSelectedKey(`custom:${custom[0].id}`);
      }
      setIsLoading(false);
    }
    load();
  }, [registry]);

  const handleCreate = async () => {
    if (!name.trim()) {
      alert(t("newProject.alert"), t("newProject.nameRequired"));
      return;
    }
    if (!selectedKey) {
      alert(t("newProject.error"), t("newProject.protocolRequired"));
      return;
    }

    setIsSaving(true);

    const colonIndex = selectedKey.indexOf(":");
    const source = selectedKey.slice(0, colonIndex) as SelectionSource;
    const protocolId = selectedKey.slice(colonIndex + 1);

    // protocol_source DB field: "official" for scientific, "custom" for custom protocols
    const dbSource: "official" | "custom" = source === "scientific" ? "official" : "custom";
    const newId = await createProject(name, protocolId, description, dbSource);

    setIsSaving(false);

    if (newId) {
      router.replace(`/project-details/${newId}` as any);
    } else {
      alert(t("newProject.error"), t("newProject.createError"));
    }
  };

  const hasNoProtocols = scientificManifests.length === 0 && customProtocols.length === 0;
  const lang = (currentLanguage as string) ?? "pt";
  const { scrollViewRef, handleFocus } = useScrollToInput();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 80}
      style={{ flex: 1 }}
    >
      <ScrollView
        ref={scrollViewRef}
        style={[styles.container, { backgroundColor: paperTheme.colors.background }]}
      >
        <Stack.Screen options={{ title: t("newProject.title"), headerBackTitle: "" }} />

        <View style={[styles.content, { paddingBottom: bottomPadding }]}>
          {/* SECTION 1: BASIC INFO */}
          <Text
            variant="titleMedium"
            style={[styles.sectionTitle, { color: paperTheme.colors.primary }]}
          >
            {t("newProject.fieldInfo")}
          </Text>

          <TextInput
            label={t("newProject.projectName")}
            placeholder={t("newProject.projectNamePlaceholder")}
            value={name}
            onChangeText={setName}
            onFocus={handleFocus}
            mode="outlined"
            style={styles.input}
            outlineColor={paperTheme.colors.outline}
            activeOutlineColor={paperTheme.colors.primary}
          />

          <TextInput
            label={t("newProject.description")}
            placeholder={t("newProject.descriptionPlaceholder")}
            value={description}
            onChangeText={setDescription}
            onFocus={handleFocus}
            mode="outlined"
            multiline
            numberOfLines={3}
            style={styles.input}
            outlineColor={paperTheme.colors.outline}
            activeOutlineColor={paperTheme.colors.primary}
          />

          {/* SECTION 2: PROTOCOL SELECTION */}
          <Text
            variant="titleMedium"
            style={[styles.sectionTitle, { color: paperTheme.colors.primary, marginTop: 24 }]}
          >
            {t("newProject.protocol")}
          </Text>
          <Text
            variant="bodyMedium"
            style={{ color: paperTheme.colors.secondary, marginBottom: 16, textAlign: "justify" }}
          >
            {t("newProject.protocolDesc")}
          </Text>

          {isLoading ? (
            <ActivityIndicator style={{ marginTop: 20 }} />
          ) : hasNoProtocols ? (
            <View style={styles.emptyState}>
              <Text
                variant="bodyMedium"
                style={{ color: paperTheme.colors.error, marginBottom: 12 }}
              >
                {t("newProject.noProtocolsAvailable")}
              </Text>
              <Button mode="outlined" onPress={() => router.push("/protocol/builder")}>
                {t("newProject.createProtocol")}
              </Button>
            </View>
          ) : (
            <RadioButton.Group onValueChange={setSelectedKey} value={selectedKey}>
              {/* Scientific/Official Protocols from the kernel registry */}
              {scientificManifests.length > 0 && (
                <>
                  <Text
                    variant="labelLarge"
                    style={[styles.subSectionTitle, { color: paperTheme.colors.secondary }]}
                  >
                    {t("newProject.officialProtocol")}
                  </Text>
                  {scientificManifests.map((manifest) => (
                    <View
                      key={`scientific:${manifest.id}`}
                      style={[styles.radioItem, { borderColor: paperTheme.colors.outline }]}
                    >
                      <RadioButton value={`scientific:${manifest.id}`} />
                      <View style={{ marginLeft: 8, flex: 1 }}>
                        <View style={styles.protocolHeader}>
                          <Text
                            variant="bodyLarge"
                            style={{ fontWeight: "bold", flex: 1 }}
                          >
                            {manifest.name[lang] ?? manifest.name["pt"] ?? manifest.id}
                          </Text>
                          <Chip
                            mode="outlined"
                            compact
                            style={{ marginLeft: 8 }}
                            textStyle={{ fontSize: 12, lineHeight: 14 }}
                          >
                            v{manifest.version}.0
                          </Chip>
                        </View>
                        {manifest.theme?.[lang] && (
                          <Text variant="bodySmall" style={{ color: paperTheme.colors.secondary }}>
                            {manifest.theme[lang]}
                          </Text>
                        )}
                        {manifest.authors.map((author, i) => (
                          <Text
                            key={i}
                            variant="bodySmall"
                            style={{ color: paperTheme.colors.secondary }}
                          >
                            {author}
                          </Text>
                        ))}
                        {manifest.description[lang] && (
                          <Text
                            variant="bodyMedium"
                            style={{
                              color: paperTheme.colors.secondary,
                              marginTop: 4,
                              textAlign: "justify",
                            }}
                          >
                            {manifest.description[lang]}
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}
                </>
              )}

              {scientificManifests.length > 0 && customProtocols.length > 0 && (
                <Divider style={{ marginVertical: 16 }} />
              )}

              {/* Custom Protocols from DB */}
              {customProtocols.length > 0 && (
                <>
                  <Text
                    variant="labelLarge"
                    style={[styles.subSectionTitle, { color: paperTheme.colors.secondary }]}
                  >
                    {t("newProject.customProtocol")}
                  </Text>
                  {customProtocols.map((p) => {
                    const sectionCount = p.schema.sections.length;
                    const fieldCount = p.schema.sections.reduce(
                      (acc, s) => acc + s.fields.length,
                      0,
                    );
                    return (
                      <View
                        key={`custom:${p.id}`}
                        style={[styles.radioItem, { borderColor: paperTheme.colors.outline }]}
                      >
                        <RadioButton value={`custom:${p.id}`} />
                        <View style={{ marginLeft: 8, flex: 1 }}>
                          <View style={styles.protocolHeader}>
                            <Text
                              variant="bodyLarge"
                              style={{ fontWeight: "bold", flex: 1 }}
                            >
                              {p.name}
                            </Text>
                          </View>
                          {p.theme && (
                            <Text
                              variant="bodyMedium"
                              style={{ color: paperTheme.colors.secondary, textAlign: "justify" }}
                            >
                              {p.theme}
                            </Text>
                          )}
                          <Text
                            variant="bodySmall"
                            style={{ color: paperTheme.colors.secondary, marginTop: 2 }}
                          >
                            {sectionCount}{" "}
                            {sectionCount === 1
                              ? t("protocol.sectionSingular")
                              : t("protocol.sectionPlural")}{" "}
                            • {fieldCount}{" "}
                            {fieldCount === 1
                              ? t("protocol.fieldSingular")
                              : t("protocol.fieldPlural")}
                          </Text>
                          {p.description && (
                            <Text
                              variant="bodyMedium"
                              style={{
                                color: paperTheme.colors.secondary,
                                marginTop: 2,
                                textAlign: "justify",
                              }}
                            >
                              {p.description}
                            </Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </>
              )}
            </RadioButton.Group>
          )}

          <Button
            mode="contained"
            onPress={handleCreate}
            loading={isSaving}
            disabled={isSaving || !selectedKey || hasNoProtocols}
            style={styles.createButton}
          >
            {t("newProject.createProject")}
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20 },
  sectionTitle: { fontWeight: "bold", marginBottom: 12 },
  subSectionTitle: {
    marginBottom: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: { marginBottom: 16 },
  radioItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderRadius: 8,
  },
  protocolHeader: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  emptyState: { padding: 20, alignItems: "center" },
  createButton: { marginTop: 32, paddingVertical: 6 },
});
