// src/app/protocol/builder.tsx
/**
 * Protocol Builder Screen - Create/Edit custom protocols
 * Form builder interface similar to Google Forms
 */

import React, { useState, useEffect, useMemo, useCallback, memo } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Dimensions,
} from "react-native";
import {
  Text,
  Card,
  Button,
  TextInput,
  IconButton,
  Icon,
  Portal,
  Dialog,
  useTheme,
  SegmentedButtons,
  RadioButton,
  Chip,
  Divider,
} from "react-native-paper";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useI18n } from "@/contexts/i18n-context";
import { useAlertDialog } from "@/hooks/use-dialog";
import { useScrollToInput } from "@/hooks/use-scroll-to-input";
import { useStableTextInput } from "@/hooks/use-stable-text-input";
import { useBottomContentPadding } from "@/hooks/use-bottom-content-padding";
import {
  createCustomProtocol,
  updateCustomProtocol,
  getCustomProtocolById,
} from "@/db/queries/custom-protocols";
import {
  CustomFieldConfig,
  CustomSection,
  CustomProtocolSchema,
  CustomFieldType,
  CustomFieldOption,
  SharedModuleRef,
} from "@/types/database";
import OptionsListInput from "@/modules/custom/components/OptionsListInput";
import { slugifyFieldKey, collectFieldKeys } from "@/modules/custom/slugify-field-key";
import {
  getFieldTypeOptions,
  getItemFieldTypeOptions,
  FieldTypeOption,
  CURATED_UNITS,
} from "@/modules/custom/config/field-types";
import {
  listBuilderAttachableModules,
  SharedModuleCatalogEntry,
} from "@/modules/registry";
import { NATIVE_PROTOCOLS_CATALOG } from "@/constants/native-protocols-catalog";
import { BUTTON_RADIUS, SEGMENTED_BUTTONS_SHAPE_THEME } from "@/constants/shape";

export default function ProtocolBuilderScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t, currentLanguage } = useI18n();
  const { alert, confirm } = useAlertDialog();
  const bottomPadding = useBottomContentPadding();
  const params = useLocalSearchParams();
  const protocolId = params.id ? Number(params.id) : undefined;

  // Helper to get field type config with translated label
  const getFieldTypes = () => getFieldTypeOptions(t);

  const [protocolName, setProtocolName] = useState("");
  const [protocolTheme, setProtocolTheme] = useState("");
  const [protocolDescription, setProtocolDescription] = useState("");
  const [collectionInstructions, setCollectionInstructions] = useState("");
  const [sections, setSections] = useState<CustomSection[]>([]);
  const [saving, setSaving] = useState(false);

  // Dialog states
  const [addFieldDialog, setAddFieldDialog] = useState(false);
  const [editFieldDialog, setEditFieldDialog] = useState(false);
  const [addModuleDialog, setAddModuleDialog] = useState(false);
  const [currentSection, setCurrentSection] = useState<string | null>(null);
  const [currentFieldIndex, setCurrentFieldIndex] = useState<number | null>(
    null,
  );
  const [fieldFormData, setFieldFormData] = useState<
    Partial<CustomFieldConfig>
  >({});

  // Separate effect for initial load
  useEffect(() => {
    if (protocolId) {
      loadProtocol();
    } else {
      // Start with one empty section
      addNewSection();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protocolId]);

  const loadProtocol = async () => {
    if (!protocolId) return;

    try {
      const protocol = await getCustomProtocolById(protocolId);
      if (protocol) {
        setProtocolName(protocol.name);
        setProtocolTheme(protocol.theme || "");
        setProtocolDescription(protocol.description || "");
        setCollectionInstructions(protocol.collection_instructions || "");
        setSections(protocol.schema.sections);
      }
    } catch (error) {
      console.error("Error loading protocol:", error);
      alert(t("common.error"), t("protocol.errorLoadingProtocol"));
    }
  };

  const addNewSection = () => {
    const newSection: CustomSection = {
      id: `section_${Date.now()}`,
      title: "",
      fields: [],
    };
    setSections([...sections, newSection]);
  };

  // Modules already attached to this protocol - filters them out of the
  // "attach scientific module" picker, since each shared module can only be
  // attached once (its id doubles as the section id).
  const attachedModuleRefs = sections
    .map((s) => s.moduleRef)
    .filter((ref): ref is SharedModuleRef => !!ref);
  const availableSharedModules = listBuilderAttachableModules().filter(
    (entry) => !attachedModuleRefs.includes(entry.descriptor.id as SharedModuleRef),
  );

  const addSharedModuleSection = (entry: SharedModuleCatalogEntry) => {
    const lang = (currentLanguage as string) ?? "pt";
    const newSection: CustomSection = {
      id: entry.descriptor.id,
      title: entry.descriptor.title[lang] ?? entry.descriptor.title.pt ?? entry.descriptor.id,
      fields: [],
      moduleRef: entry.descriptor.id as SharedModuleRef,
    };
    setSections([...sections, newSection]);
    setAddModuleDialog(false);
  };

  const updateSection = (
    sectionId: string,
    updates: Partial<CustomSection>,
  ) => {
    setSections(
      sections.map((s) => (s.id === sectionId ? { ...s, ...updates } : s)),
    );
  };

  const deleteSection = (sectionId: string) => {
    confirm(
      t("protocol.deleteSection"),
      t("protocol.deleteSectionConfirm"),
      () => setSections(sections.filter((s) => s.id !== sectionId)),
      () => {},
      t("common.delete"),
      t("common.cancel"),
    );
  };

  const openAddFieldDialog = (sectionId: string) => {
    setCurrentSection(sectionId);
    setCurrentFieldIndex(null);
    setFieldFormData({
      key: `field_${Date.now()}`,
      label: "",
      required: false,
      // Don't set type yet - let user choose
    });
    setAddFieldDialog(true);
  };

  const openEditFieldDialog = (sectionId: string, fieldIndex: number) => {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;

    setCurrentSection(sectionId);
    setCurrentFieldIndex(fieldIndex);
    setFieldFormData(section.fields[fieldIndex]);
    setEditFieldDialog(true);
  };

  const saveField = (data: Partial<CustomFieldConfig>) => {
    if (!currentSection || !data.label || !data.type) return;

    const isNewField = currentFieldIndex === null;
    const key = isNewField
      ? slugifyFieldKey(data.label, collectFieldKeys(sections))
      : (data.key as string); // editing: keep the existing key frozen

    const newField: CustomFieldConfig = {
      key,
      type: data.type as CustomFieldType,
      label: data.label,
      description: data.description,
      required: data.required || false,
      options: data.options,
      min: data.min,
      max: data.max,
      unit: data.unit,
      default_value: data.default_value,
      itemFields: data.type === "repeatable_group" ? data.itemFields : undefined,
    };

    setSections(
      sections.map((section) => {
        if (section.id !== currentSection) return section;

        const newFields = [...section.fields];
        if (currentFieldIndex !== null) {
          // Edit existing field
          newFields[currentFieldIndex] = newField;
        } else {
          // Add new field
          newFields.push(newField);
        }

        return { ...section, fields: newFields };
      }),
    );

    setAddFieldDialog(false);
    setEditFieldDialog(false);
    setFieldFormData({});
  };

  const deleteField = (sectionId: string, fieldIndex: number) => {
    confirm(
      t("protocol.deleteField"),
      t("protocol.deleteFieldConfirm"),
      () => {
        setSections(
          sections.map((section) => {
            if (section.id !== sectionId) return section;
            return {
              ...section,
              fields: section.fields.filter((_, index) => index !== fieldIndex),
            };
          }),
        );
      },
      () => {},
      t("common.delete"),
      t("common.cancel"),
    );
  };

  const validateProtocol = (): boolean => {
    if (!protocolName.trim()) {
      alert(t("common.error"), t("protocol.enterProtocolName"));
      return false;
    }

    if (!protocolTheme.trim()) {
      alert(t("common.error"), t("protocol.enterTheme"));
      return false;
    }

    if (sections.length === 0) {
      alert(t("common.error"), t("protocol.addAtLeastOneSection"));
      return false;
    }

    if (sections.some((s) => !s.title.trim())) {
      alert(t("common.error"), t("protocol.enterSectionTitle"));
      return false;
    }

    const hasFields = sections.some((s) => s.fields.length > 0 || !!s.moduleRef);
    if (!hasFields) {
      alert(t("common.error"), t("protocol.addAtLeastOneField"));
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (!validateProtocol()) return;

    try {
      setSaving(true);

      const schema: CustomProtocolSchema = {
        sections,
        metadata: {
          version: "1.0",
          created_by: "user", // TODO: Add user system
        },
      };

      if (protocolId) {
        await updateCustomProtocol(protocolId, {
          name: protocolName,
          theme: protocolTheme,
          description: protocolDescription,
          collection_instructions: collectionInstructions,
          schema,
        });
        alert(t("common.success"), t("protocol.protocolUpdated"));
      } else {
        await createCustomProtocol(
          protocolName,
          schema,
          protocolTheme,
          protocolDescription,
          collectionInstructions,
        );
        alert(t("common.success"), t("protocol.protocolCreated"));
      }

      router.back();
    } catch (error) {
      console.error("Error saving protocol:", error);
      alert(t("common.error"), t("protocol.errorSavingProtocol"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 80}
    >
      <Stack.Screen
        options={{
          title: protocolId
            ? t("protocol.editProtocol")
            : t("protocol.createProtocol"),
        }}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Recommendation / guidance card. Content is a placeholder for now
            (Pablo will elaborate it later) - just needs to exist here at
            the top so the section has a fixed place in the layout. */}
        <Card
          mode="outlined"
          style={[
            styles.card,
            { backgroundColor: theme.colors.primaryContainer },
          ]}
        >
          <Card.Content>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <Icon source="lightbulb-outline" size={20} color={theme.colors.onPrimaryContainer} />
              <Text
                variant="titleMedium"
                style={{ color: theme.colors.onPrimaryContainer, marginLeft: 8 }}
              >
                {t("protocol.recommendationTitle")}
              </Text>
            </View>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onPrimaryContainer, textAlign: "justify" }}
            >
              {t("protocol.recommendationText")}
            </Text>
          </Card.Content>
        </Card>

        {/* Protocol Info */}
        <Card mode="outlined" style={styles.card}>
          <Card.Content>
            <Text
              variant="titleMedium"
              style={{ color: theme.colors.onSurface, marginBottom: 12 }}
            >
              {t("protocol.protocolInfoTitle")}
            </Text>
            <TextInput
              mode="outlined"
              label={t("protocol.protocolName") + " *"}
              value={protocolName}
              onChangeText={setProtocolName}
              placeholder={t("protocol.protocolNamePlaceholder")}
              autoComplete="off"
              importantForAutofill="no"
              style={styles.input}
            />
            <TextInput
              mode="outlined"
              label={t("protocol.theme") + " *"}
              value={protocolTheme}
              onChangeText={setProtocolTheme}
              placeholder={t("protocol.themePlaceholder")}
              autoComplete="off"
              importantForAutofill="no"
              style={styles.input}
            />
            <TextInput
              mode="outlined"
              label={t("protocol.description")}
              value={protocolDescription}
              onChangeText={setProtocolDescription}
              placeholder={t("protocol.descriptionPlaceholder")}
              multiline
              numberOfLines={3}
              autoComplete="off"
              importantForAutofill="no"
              style={styles.input}
            />
            <TextInput
              mode="outlined"
              label={t("protocol.collectionInstructions")}
              value={collectionInstructions}
              onChangeText={setCollectionInstructions}
              placeholder={t("protocol.collectionInstructionsPlaceholder")}
              multiline
              numberOfLines={4}
              autoComplete="off"
              importantForAutofill="no"
              style={styles.input}
            />
          </Card.Content>
        </Card>

        {/* Sections */}
        {sections.map((section, sectionIndex) => (
          <SectionCard
            key={section.id}
            section={section}
            sectionIndex={sectionIndex}
            onUpdate={(updates: Partial<CustomSection>) =>
              updateSection(section.id, updates)
            }
            onDelete={() => deleteSection(section.id)}
            onAddField={() => openAddFieldDialog(section.id)}
            onEditField={(fieldIndex: number) =>
              openEditFieldDialog(section.id, fieldIndex)
            }
            onDeleteField={(fieldIndex: number) =>
              deleteField(section.id, fieldIndex)
            }
            theme={theme}
            getFieldTypes={getFieldTypes}
            t={t}
          />
        ))}

        {/* Add Section Button */}
        <Button
          mode="outlined"
          icon="plus"
          onPress={addNewSection}
          style={[styles.addSectionButton, { borderRadius: BUTTON_RADIUS }]}
        >
          {t("protocol.addSection")}
        </Button>

        {/* Add Scientific Module Button */}
        <Button
          mode="outlined"
          icon="flask-outline"
          onPress={() => setAddModuleDialog(true)}
          disabled={availableSharedModules.length === 0}
          style={[styles.addSectionButton, { borderRadius: BUTTON_RADIUS }]}
        >
          {t("protocol.addScientificModule")}
        </Button>

        {/* Save Button */}
        <Button
          mode="contained"
          icon="content-save"
          onPress={handleSave}
          loading={saving}
          disabled={saving}
          style={{ borderRadius: BUTTON_RADIUS }}
        >
          {protocolId
            ? t("protocol.updateProtocol")
            : t("protocol.createProtocol")}
        </Button>
      </ScrollView>

      {/* Field Form Dialog */}
      <FieldFormDialog
        visible={addFieldDialog || editFieldDialog}
        onDismiss={() => {
          setAddFieldDialog(false);
          setEditFieldDialog(false);
        }}
        onSave={saveField}
        fieldData={fieldFormData}
        onFieldDataChange={setFieldFormData}
        isEdit={editFieldDialog}
        theme={theme}
        getFieldTypes={getFieldTypes}
        t={t}
      />

      {/* Add Scientific Module Dialog */}
      {addModuleDialog && (
        <ModuleSelectionDialog
          visible={addModuleDialog}
          onDismiss={() => setAddModuleDialog(false)}
          modules={availableSharedModules}
          lang={(currentLanguage as string) ?? "pt"}
          onSelect={addSharedModuleSection}
          theme={theme}
          t={t}
        />
      )}
    </KeyboardAvoidingView>
  );
}

// Section Card Component
function SectionCard({
  section,
  sectionIndex,
  onUpdate,
  onDelete,
  onAddField,
  onEditField,
  onDeleteField,
  theme,
  getFieldTypes,
  t,
}: any) {
  const [localTitle, setLocalTitle] = useState(section.title);
  const [localDescription, setLocalDescription] = useState(
    section.description || "",
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fieldTypes = useMemo(() => getFieldTypes(), [t]);

  // Update local state when section changes from outside
  useEffect(() => {
    setLocalTitle(section.title);
    setLocalDescription(section.description || "");
  }, [section.id, section.title, section.description]);

  const handleTitleBlur = () => {
    if (localTitle !== section.title) {
      onUpdate({ title: localTitle });
    }
  };

  const handleDescriptionBlur = () => {
    if (localDescription !== section.description) {
      onUpdate({ description: localDescription });
    }
  };

  // Prefab scientific module sections (moduleRef set) have a fixed identity
  // owned by the shared module's ModuleDescriptor/renderer - the real
  // renderers ignore CustomSection.title entirely, so it's shown read-only
  // instead of editable, and there's no field list to manage here.
  if (section.moduleRef) {
    return (
      <Card mode="outlined" style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderTitle}>
            <Text variant="titleMedium" style={{ paddingVertical: 8 }}>
              {section.title}
            </Text>
          </View>
          <IconButton
            icon="delete"
            onPress={onDelete}
            accessibilityLabel={t("protocol.deleteSection")}
          />
        </View>
        <Card.Content>
          <Chip icon="flask-outline" style={{ alignSelf: "flex-start" }}>
            {t("protocol.scientificModuleBadge")}
          </Chip>
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card mode="outlined" style={styles.sectionCard}>
      {/* Custom header (not Card.Title): Card.Title's `title` prop only supports
          string/<Text> children and wraps it in a <Text numberOfLines={1}>, which
          is not a valid host for a focusable TextInput and caused flicker/focus
          loss while typing. This View reproduces Card.Title's layout metrics. */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderTitle}>
          <TextInput
            value={localTitle}
            onChangeText={setLocalTitle}
            onBlur={handleTitleBlur}
            placeholder={t("protocol.sectionTitle")}
            style={{ backgroundColor: "transparent" }}
            underlineColor="transparent"
            activeUnderlineColor={theme.colors.primary}
            autoComplete="off"
            importantForAutofill="no"
          />
        </View>
        <IconButton
          icon="delete"
          onPress={onDelete}
          accessibilityLabel={t("protocol.deleteSection")}
        />
      </View>
      <Card.Content>
        <TextInput
          mode="outlined"
          label={t("protocol.sectionDescription")}
          value={localDescription}
          onChangeText={setLocalDescription}
          onBlur={handleDescriptionBlur}
          multiline
          numberOfLines={2}
          style={{ marginBottom: 16 }}
          autoComplete="off"
          importantForAutofill="no"
        />

        {/* Fields List */}
        {section.fields.map((field: CustomFieldConfig, fieldIndex: number) => {
          const fieldType = fieldTypes.find(
            (ft: FieldTypeOption) => ft.value === field.type,
          );
          return (
            <Card key={field.key} mode="contained" style={styles.fieldCard}>
              <Card.Content>
                <View style={styles.fieldRow}>
                  <IconButton
                    icon={fieldType?.icon || "help-circle-outline"}
                    size={20}
                    iconColor={theme.colors.onSurfaceVariant}
                    style={{ margin: 0, marginRight: 4 }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium" style={{ fontWeight: "600" }}>
                      {field.label}
                      {field.required && (
                        <Text style={{ color: theme.colors.error }}> *</Text>
                      )}
                    </Text>
                    <Text
                      variant="bodySmall"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      {fieldType?.label || field.type}
                    </Text>
                  </View>
                  <View style={styles.fieldActions}>
                    <IconButton
                      icon="pencil"
                      size={20}
                      onPress={() => onEditField(fieldIndex)}
                    />
                    <IconButton
                      icon="delete"
                      size={20}
                      onPress={() => onDeleteField(fieldIndex)}
                    />
                  </View>
                </View>
              </Card.Content>
            </Card>
          );
        })}

        {/* Add Field Button */}
        <Button
          mode="text"
          icon="plus"
          onPress={onAddField}
          style={{ marginTop: 8 }}
        >
          {t("protocol.addField")}
        </Button>
      </Card.Content>
    </Card>
  );
}

// Stable empty array so OptionsListInput's `value` prop keeps the same
// reference across re-renders when no options were added yet - a fresh
// `fieldData.options || []` literal on every render would defeat the
// React.memo below and force it to reconcile on unrelated keystrokes.
const EMPTY_OPTIONS: CustomFieldOption[] = [];

// Same rationale as EMPTY_OPTIONS above, for the "repeatable_group" item fields list.
const EMPTY_ITEM_FIELDS: CustomFieldConfig[] = [];

// Fixed field dialog height, calculated once from the initial window
// - never recalculated when the keyboard opens (which would make the modal
// shrink/grow along with the keyboard). The internal ScrollView + useScrollToInput
// take care of keeping the focused field visible, without needing to resize the dialog.
const FIELD_DIALOG_MAX_HEIGHT = Dimensions.get("window").height * 0.8;

// Field type selection list, extracted so it only mounts (and reconciles
// its ~12 icon rows) while actually open, instead of sitting in the tree
// for the FieldFormDialog's whole lifetime and re-rendering on every
// keystroke typed into the label/help/guidance fields.
const TypeSelectionDialog = memo(function TypeSelectionDialog({
  visible,
  onDismiss,
  fieldTypes,
  selectedType,
  onSelect,
  theme,
  t,
}: any) {
  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={onDismiss}
        style={{ maxHeight: "70%" }}
      >
        <Dialog.Title style={{ fontSize: 16 }} numberOfLines={1}>
          {t("protocol.selectFieldType")}
        </Dialog.Title>
        <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
          <ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
            {fieldTypes.map((type: FieldTypeOption) => {
              const isSelected = selectedType === type.value;
              return (
                <Pressable
                  key={type.value}
                  onPress={() => onSelect(type.value as CustomFieldType)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 10,
                    paddingHorizontal: 20,
                    backgroundColor: isSelected
                      ? theme.colors.primaryContainer
                      : "transparent",
                  }}
                >
                  <Icon
                    source={type.icon}
                    size={22}
                    color={isSelected ? theme.colors.primary : theme.colors.onSurfaceVariant}
                  />
                  <Text
                    variant="bodyMedium"
                    style={{
                      flex: 1,
                      marginLeft: 16,
                      color: isSelected ? theme.colors.primary : theme.colors.onSurface,
                      fontWeight: isSelected ? "600" : "400",
                    }}
                  >
                    {type.label}
                  </Text>
                  {isSelected && (
                    <Icon source="check" size={18} color={theme.colors.primary} />
                  )}
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
});

// Picker for attaching a prefab scientific module (modules/registry.ts)
// to the protocol - same own-Portal/own-Dialog + Pressable-list pattern as
// TypeSelectionDialog above (and app/(projects)/protocol/native-catalog.tsx).
function ModuleSelectionDialog({
  visible,
  onDismiss,
  modules,
  lang,
  onSelect,
  theme,
  t,
}: {
  visible: boolean;
  onDismiss: () => void;
  modules: SharedModuleCatalogEntry[];
  lang: string;
  onSelect: (entry: SharedModuleCatalogEntry) => void;
  theme: any;
  t: (key: string) => string;
}) {
  // Grouped by protocolId (in first-seen order) so the picker scales cleanly
  // once modules from more than one native protocol are attachable - today
  // that's just "paisageo", so there's a single group, but the structure
  // already supports more.
  const groups = useMemo(() => {
    const byProtocol = new Map<string, { protocolName: string; entries: SharedModuleCatalogEntry[] }>();
    for (const entry of modules) {
      const existing = byProtocol.get(entry.protocolId);
      if (existing) {
        existing.entries.push(entry);
      } else {
        byProtocol.set(entry.protocolId, {
          protocolName: entry.protocolName[lang] ?? entry.protocolName.pt ?? entry.protocolId,
          entries: [entry],
        });
      }
    }
    return Array.from(byProtocol.values());
  }, [modules, lang]);

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={{ maxHeight: "80%" }}>
        <Dialog.Title style={{ fontSize: 16 }} numberOfLines={1}>
          {t("protocol.selectScientificModule")}
        </Dialog.Title>
        <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
          <ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
            {modules.length === 0 ? (
              <Text
                variant="bodyMedium"
                style={{ paddingHorizontal: 20, color: theme.colors.onSurfaceVariant }}
              >
                {t("protocol.noScientificModulesAvailable")}
              </Text>
            ) : (
              groups.map((group, groupIndex) => (
                <View key={group.protocolName}>
                  {groupIndex > 0 && <Divider style={{ marginVertical: 8 }} />}
                  <Text
                    variant="labelLarge"
                    style={{
                      paddingHorizontal: 20,
                      paddingTop: groupIndex > 0 ? 4 : 0,
                      paddingBottom: 4,
                      color: theme.colors.primary,
                    }}
                  >
                    {group.protocolName}
                  </Text>
                  {group.entries.map((entry) => {
                    const description =
                      NATIVE_PROTOCOLS_CATALOG[entry.protocolId]?.modules.find(
                        (m) => m.id === entry.descriptor.id,
                      )?.description;
                    return (
                      <Pressable
                        key={entry.descriptor.id}
                        onPress={() => onSelect(entry)}
                        style={{
                          flexDirection: "row",
                          paddingVertical: 10,
                          paddingHorizontal: 20,
                        }}
                      >
                        <Icon source="flask-outline" size={22} color={theme.colors.onSurfaceVariant} />
                        <View style={{ flex: 1, marginLeft: 16 }}>
                          <Text variant="bodyMedium">
                            {entry.descriptor.title[lang] ?? entry.descriptor.title.pt ?? entry.descriptor.id}
                          </Text>
                          {description && (
                            <Text
                              variant="bodySmall"
                              style={{ color: theme.colors.onSurfaceVariant, marginTop: 2, textAlign: "justify" }}
                            >
                              {description[lang] ?? description.pt}
                            </Text>
                          )}
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ))
            )}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onDismiss}>{t("common.close")}</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

// Unit selection list for the Number field type. Same shape as
// TypeSelectionDialog above (own Dialog + own Portal, mounted only while
// open) - a Menu anchored inside FieldFormDialog's own Dialog was tried
// first, but nesting two react-native-paper Modals (Dialog + Menu) leaves
// the outer Dialog deaf to touches the second time the Menu closes, a known
// RN/Android nested-Modal issue. Stacking a separate Portal avoids it.
const UnitSelectionDialog = memo(function UnitSelectionDialog({
  visible,
  onDismiss,
  onSelectUnit,
  onSelectCustom,
  selectedUnit,
  isCustom,
  theme,
  t,
}: any) {
  const renderItem = (label: string, isSelected: boolean, onPress: () => void, key: string) => (
    <Pressable
      key={key}
      onPress={onPress}
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
        {label}
      </Text>
      {isSelected && <Icon source="check" size={18} color={theme.colors.primary} />}
    </Pressable>
  );

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={{ maxHeight: "70%" }}>
        <Dialog.Title style={{ fontSize: 16 }} numberOfLines={1}>
          {t("protocol.selectUnit")}
        </Dialog.Title>
        <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
          <ScrollView contentContainerStyle={{ paddingVertical: 8 }}>
            {renderItem(t("protocol.noUnit"), !isCustom && !selectedUnit, () => onSelectUnit(undefined), "none")}
            {CURATED_UNITS.map((u) =>
              renderItem(u, !isCustom && selectedUnit === u, () => onSelectUnit(u), u),
            )}
            {renderItem(t("protocol.customUnit"), isCustom, onSelectCustom, "custom")}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onDismiss}>{t("common.close")}</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
});

// Options manager for radio/checkbox fields, extracted out of the inline
// tertiaryContainer block (which used to render OptionsListInput directly in
// the field dialog, including every option's description input, and made
// the dialog very tall/cluttered). Same nested Dialog + own Portal pattern
// as TypeSelectionDialog/UnitSelectionDialog above, mounted only while open.
const OptionsManagerDialog = memo(function OptionsManagerDialog({
  visible,
  onDismiss,
  options,
  onChange,
  placeholder,
  theme,
  t,
}: any) {
  const { scrollViewRef, handleFocus } = useScrollToInput();
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={{ maxHeight: "80%" }}>
        <Dialog.Title style={{ fontSize: 16 }} numberOfLines={1}>
          {t("protocol.manageOptions")}
        </Dialog.Title>
        <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 8 }}
            keyboardShouldPersistTaps="handled"
          >
            <OptionsListInput
              value={options}
              onChange={onChange}
              onFocus={handleFocus}
              placeholder={placeholder}
            />
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onDismiss}>{t("common.close")}</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
});

// Manages the sub-fields of a "repeatable_group" field. Reuses FieldFormDialog
// itself (below) to add/edit each sub-field, with the field-type list
// filtered to exclude "repeatable_group" (no nesting - a group's sub-fields
// mirror the kernel's DynamicGroupRule.itemFields, which never contains
// another dynamic group). Same nested Dialog + own Portal pattern as
// OptionsManagerDialog above, mounted only while open.
const ItemFieldsManagerDialog = memo(function ItemFieldsManagerDialog({
  visible,
  onDismiss,
  itemFields,
  onChange,
  theme,
  t,
}: any) {
  const [subFieldDialogVisible, setSubFieldDialogVisible] = useState(false);
  const [subFieldEditIndex, setSubFieldEditIndex] = useState<number | null>(null);
  const [subFieldFormData, setSubFieldFormData] = useState<Partial<CustomFieldConfig>>({});
  const itemFieldTypes = useMemo(() => getItemFieldTypeOptions(t), [t]);
  const getItemFieldTypes = useCallback(() => itemFieldTypes, [itemFieldTypes]);

  const openAddSubField = () => {
    setSubFieldEditIndex(null);
    setSubFieldFormData({ key: `field_${Date.now()}`, label: "", required: false });
    setSubFieldDialogVisible(true);
  };

  const openEditSubField = (index: number) => {
    setSubFieldEditIndex(index);
    setSubFieldFormData(itemFields[index]);
    setSubFieldDialogVisible(true);
  };

  const deleteSubField = (index: number) => {
    onChange(itemFields.filter((_: CustomFieldConfig, i: number) => i !== index));
  };

  const saveSubField = (data: Partial<CustomFieldConfig>) => {
    if (!data.label || !data.type) return;

    const isNew = subFieldEditIndex === null;
    // Sub-field keys only need to be unique within this group, not across
    // the whole protocol - a different group (or a plain field) can reuse
    // the same key without any collision (each group is a separate
    // DynamicGroupRule, scoped independently in the kernel).
    const key = isNew
      ? slugifyFieldKey(data.label, new Set(itemFields.map((f: CustomFieldConfig) => f.key)))
      : (data.key as string);

    const newSubField: CustomFieldConfig = {
      key,
      type: data.type as CustomFieldType,
      label: data.label,
      description: data.description,
      required: data.required || false,
      options: data.options,
      min: data.min,
      max: data.max,
      unit: data.unit,
      default_value: data.default_value,
    };

    if (isNew) {
      onChange([...itemFields, newSubField]);
    } else {
      onChange(
        itemFields.map((f: CustomFieldConfig, i: number) => (i === subFieldEditIndex ? newSubField : f)),
      );
    }
    setSubFieldDialogVisible(false);
  };

  return (
    <>
      <Portal>
        <Dialog visible={visible} onDismiss={onDismiss} style={{ maxHeight: "80%" }}>
          <Dialog.Title style={{ fontSize: 16 }} numberOfLines={1}>
            {t("protocol.manageItemFields")}
          </Dialog.Title>
          <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 8 }}>
              {itemFields.map((field: CustomFieldConfig, index: number) => {
                const fieldType = itemFieldTypes.find((ft: FieldTypeOption) => ft.value === field.type);
                return (
                  <Card key={field.key} mode="contained" style={styles.fieldCard}>
                    <Card.Content>
                      <View style={styles.fieldRow}>
                        <IconButton
                          icon={fieldType?.icon || "help-circle-outline"}
                          size={20}
                          iconColor={theme.colors.onSurfaceVariant}
                          style={{ margin: 0, marginRight: 4 }}
                        />
                        <View style={{ flex: 1 }}>
                          <Text variant="bodyMedium" style={{ fontWeight: "600" }}>
                            {field.label}
                            {field.required && <Text style={{ color: theme.colors.error }}> *</Text>}
                          </Text>
                          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                            {fieldType?.label || field.type}
                          </Text>
                        </View>
                        <View style={styles.fieldActions}>
                          <IconButton icon="pencil" size={20} onPress={() => openEditSubField(index)} />
                          <IconButton icon="delete" size={20} onPress={() => deleteSubField(index)} />
                        </View>
                      </View>
                    </Card.Content>
                  </Card>
                );
              })}
              {itemFields.length === 0 && (
                <Text
                  variant="bodySmall"
                  style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}
                >
                  {t("protocol.noItemFieldsAdded")}
                </Text>
              )}
              <Button mode="text" icon="plus" onPress={openAddSubField} style={{ marginTop: 8 }}>
                {t("protocol.addItemField")}
              </Button>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={onDismiss}>{t("common.close")}</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {subFieldDialogVisible && (
        <FieldFormDialog
          visible={subFieldDialogVisible}
          onDismiss={() => setSubFieldDialogVisible(false)}
          onSave={saveSubField}
          fieldData={subFieldFormData}
          onFieldDataChange={setSubFieldFormData}
          isEdit={subFieldEditIndex !== null}
          theme={theme}
          getFieldTypes={getItemFieldTypes}
          t={t}
        />
      )}
    </>
  );
});

// Validation popup, styled like the app's standard alert (DialogProvider in
// hooks/use-dialog.tsx). Can't reuse useAlertDialog()'s alert() directly:
// its Portal is mounted once at the app root (app/_layout.tsx), and Paper's
// PortalManager stacks portals in mount order without reordering on update
// (node_modules/react-native-paper/src/components/Portal/PortalManager.tsx)
// - so it would always render *behind* this dialog's own Portal, invisible.
// Nesting it here (like TypeSelectionDialog above) guarantees it stacks on
// top, while looking identical to the app-wide alert.
const FieldValidationAlert = memo(function FieldValidationAlert({
  message,
  onDismiss,
  theme,
  t,
}: any) {
  return (
    <Portal>
      <Dialog
        visible={!!message}
        onDismiss={onDismiss}
        style={{ backgroundColor: theme.colors.surface }}
      >
        <Dialog.Title
          numberOfLines={1}
          style={{ color: theme.colors.onSurface, textAlign: "justify", fontSize: 16 }}
        >
          {t("common.error")}
        </Dialog.Title>
        <Dialog.Content>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant, textAlign: "justify" }}
          >
            {message}
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button mode="text" onPress={onDismiss}>
            OK
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
});

// Field Form Dialog Component
function FieldFormDialog({
  visible,
  onDismiss,
  onSave,
  fieldData,
  onFieldDataChange,
  isEdit,
  theme,
  getFieldTypes,
  t,
}: any) {
  const [typeDialogVisible, setTypeDialogVisible] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");
  const [unitDialogVisible, setUnitDialogVisible] = useState(false);
  const [optionsDialogVisible, setOptionsDialogVisible] = useState(false);
  const [itemFieldsDialogVisible, setItemFieldsDialogVisible] = useState(false);
  const [unitIsCustom, setUnitIsCustom] = useState(
    () => !!fieldData.unit && !CURATED_UNITS.includes(fieldData.unit),
  );

  // Each text field owns its native value while focused (see
  // useStableTextInput) - resetKey resyncs them whenever a different field
  // is opened (add gets a fresh fieldData.key each time; edit reuses the
  // field's own key), replacing the old visible/fieldData.key useEffect.
  // Suffixed per field so adjacent siblings (min/max) never share a key.
  const labelInput = useStableTextInput(`${fieldData.key}-label`, fieldData.label || "");
  const descriptionInput = useStableTextInput(`${fieldData.key}-description`, fieldData.description || "");
  const minInput = useStableTextInput(`${fieldData.key}-min`, fieldData.min?.toString() || "");
  const maxInput = useStableTextInput(`${fieldData.key}-max`, fieldData.max?.toString() || "");
  const unitInput = useStableTextInput(
    `${fieldData.key}-unit`,
    unitIsCustom ? fieldData.unit || "" : "",
  );

  const needsOptions = ["radio", "checkbox"].includes(fieldData.type);
  const needsItemFields = fieldData.type === "repeatable_group";
  // Description doesn't make sense for media/list field types (they're not an input
  // where a filling hint helps).
  const needsDescription = !["photo_input", "notes_list", "audio_notes_input", "species_list"].includes(
    fieldData.type,
  );
  // Evaluation: only the max is configurable (min is always 0, fixed).
  // Number: min and max are independent and optional.
  const needsMin = fieldData.type === "number";
  const needsMax = ["number", "rating"].includes(fieldData.type);
  // Measurement unit: only the Number type has this option (Percentage and
  // Azimuth already have an implicit unit in the type itself).
  const needsUnit = fieldData.type === "number";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fieldTypes = useMemo(() => getFieldTypes(), [t]);
  const { scrollViewRef, handleFocus } = useScrollToInput();

  // Dismiss any leftover validation popup when a different field is opened.
  useEffect(() => {
    if (visible) setValidationMessage("");
  }, [visible, fieldData.key]);

  // Resync the "Outra" unit toggle whenever a different field is opened
  // (mirrors resetKey resync in useStableTextInput, which only covers text).
  useEffect(() => {
    setUnitIsCustom(!!fieldData.unit && !CURATED_UNITS.includes(fieldData.unit));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldData.key]);

  // Merges the dialog's locally-typed text fields into fieldData (the
  // parent's state), used when saving.
  const buildFieldDataWithLocalState = () => ({
    ...fieldData,
    label: labelInput.value,
    description: needsDescription ? descriptionInput.value.trim() || undefined : undefined,
    min: minInput.value ? Number(minInput.value) : undefined,
    max: maxInput.value ? Number(maxInput.value) : undefined,
    unit: needsUnit
      ? unitIsCustom
        ? unitInput.value.trim() || undefined
        : fieldData.unit
      : undefined,
  });

  const validateAndSave = () => {
    if (!labelInput.value.trim()) {
      setValidationMessage(t("protocol.fillRequiredFields"));
      return;
    }

    if (!fieldData.type) {
      setValidationMessage(t("protocol.selectType"));
      return;
    }

    if (needsOptions && (!fieldData.options || fieldData.options.length === 0)) {
      setValidationMessage(t("protocol.addAtLeastOneOption"));
      return;
    }

    if (needsItemFields && (!fieldData.itemFields || fieldData.itemFields.length === 0)) {
      setValidationMessage(t("protocol.addAtLeastOneItemField"));
      return;
    }

    if (fieldData.type === "rating" && !maxInput.value.trim()) {
      setValidationMessage(t("protocol.maximumRequired"));
      return;
    }

    const mergedFieldData = buildFieldDataWithLocalState();
    onFieldDataChange(mergedFieldData);
    // Pass the merged data directly instead of letting the parent read its
    // own `fieldFormData` state: onFieldDataChange above only *schedules*
    // that update, so the parent would still see the stale (pre-label)
    // value if it read its own state synchronously here.
    onSave(mergedFieldData);
  };

  const handleTypeSelect = useCallback(
    (type: CustomFieldType) => {
      onFieldDataChange((prev: any) => ({ ...prev, type }));
      setTypeDialogVisible(false);
    },
    [onFieldDataChange],
  );

  const handleOptionsChange = useCallback(
    (options: CustomFieldOption[]) => {
      onFieldDataChange((prev: any) => ({ ...prev, options }));
    },
    [onFieldDataChange],
  );

  const handleItemFieldsChange = useCallback(
    (itemFields: CustomFieldConfig[]) => {
      onFieldDataChange((prev: any) => ({ ...prev, itemFields }));
    },
    [onFieldDataChange],
  );

  const handleUnitSelect = useCallback(
    (unit: string | undefined) => {
      setUnitIsCustom(false);
      onFieldDataChange((prev: any) => ({ ...prev, unit }));
      setUnitDialogVisible(false);
    },
    [onFieldDataChange],
  );

  const handleCustomUnitSelect = useCallback(() => {
    setUnitIsCustom(true);
    setUnitDialogVisible(false);
  }, []);

  return (
    <Portal>
      {/* No KeyboardAvoidingView: the dialog keeps a fixed height
          (FIELD_DIALOG_MAX_HEIGHT, calculated once, not recalculated
          when the keyboard opens) instead of shrinking/growing as the
          keyboard appears. useScrollToInput (via scrollViewRef/handleFocus)
          already takes care of keeping the focused field visible through scrolling. */}
      <Dialog
        visible={visible}
        onDismiss={onDismiss}
        style={{ maxHeight: FIELD_DIALOG_MAX_HEIGHT }}
      >
        <Dialog.Title style={{ fontSize: 16 }} numberOfLines={1}>
          {isEdit ? t("protocol.editField") : t("protocol.newField")}
        </Dialog.Title>
        <Dialog.ScrollArea>
          <ScrollView
            ref={scrollViewRef}
            contentContainerStyle={{ paddingHorizontal: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            <TextInput
              key={labelInput.resetKey}
              mode="outlined"
              label={t("protocol.fieldLabel") + " *"}
              {...labelInput.inputProps}
              onFocus={(e: any) => {
                labelInput.onFocus();
                handleFocus(e);
              }}
              placeholder={t("protocol.fieldLabelPlaceholder")}
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              importantForAutofill="no"
              style={styles.dialogInput}
            />

            <Button
              mode="outlined"
              onPress={() => setTypeDialogVisible(true)}
              contentStyle={{ justifyContent: "flex-start" }}
              icon={
                fieldData.type
                  ? fieldTypes.find(
                      (t: FieldTypeOption) => t.value === fieldData.type,
                    )?.icon
                  : "format-list-bulleted-type"
              }
              style={[styles.dialogInput, { width: "100%", borderRadius: BUTTON_RADIUS }]}
            >
              {fieldData.type
                ? fieldTypes.find(
                    (ft: FieldTypeOption) => ft.value === fieldData.type,
                  )?.label
                : t("protocol.selectType")}
            </Button>

            {/* Type Selection Dialog: a second Dialog layered on top, so
                "Novo Campo" never closes/reopens while picking a type (that
                round-trip was the source of several stale-state bugs when
                this used to navigate to a full-screen route instead).
                Only mounted while open - see TypeSelectionDialog above. */}
            {typeDialogVisible && (
              <TypeSelectionDialog
                visible={typeDialogVisible}
                onDismiss={() => setTypeDialogVisible(false)}
                fieldTypes={fieldTypes}
                selectedType={fieldData.type}
                onSelect={handleTypeSelect}
                theme={theme}
                t={t}
              />
            )}

            {needsDescription && (
              <TextInput
                key={descriptionInput.resetKey}
                mode="outlined"
                label={t("protocol.fieldDescription")}
                {...descriptionInput.inputProps}
                onFocus={(e: any) => {
                  descriptionInput.onFocus();
                  handleFocus(e);
                }}
                placeholder={t("protocol.fieldDescriptionPlaceholder")}
                multiline
                numberOfLines={2}
                autoCorrect={false}
                spellCheck={false}
                autoComplete="off"
                importantForAutofill="no"
                style={styles.dialogInput}
              />
            )}

            {needsOptions && (
              <View style={styles.dialogInput}>
                <Text
                  variant="bodyMedium"
                  style={{ marginBottom: 8, color: theme.colors.onSurface }}
                >
                  {t("protocol.options") + " *"}
                </Text>
                <Button
                  mode="outlined"
                  icon="format-list-bulleted"
                  onPress={() => setOptionsDialogVisible(true)}
                  contentStyle={{ justifyContent: "flex-start" }}
                  style={{ width: "100%", borderRadius: BUTTON_RADIUS }}
                >
                  {`${t("protocol.manageOptions")} (${fieldData.options?.length || 0})`}
                </Button>
                <Text
                  variant="bodySmall"
                  numberOfLines={1}
                  style={{ marginTop: 6, color: theme.colors.onSurfaceVariant }}
                >
                  {fieldData.options?.length
                    ? fieldData.options.map((o: CustomFieldOption) => o.value).join(", ")
                    : t("protocol.noOptionsAdded")}
                </Text>

                {/* Own Dialog + own Portal (see OptionsManagerDialog above),
                    only mounted while open - same pattern as
                    TypeSelectionDialog/UnitSelectionDialog. */}
                {optionsDialogVisible && (
                  <OptionsManagerDialog
                    visible={optionsDialogVisible}
                    onDismiss={() => setOptionsDialogVisible(false)}
                    options={fieldData.options || EMPTY_OPTIONS}
                    onChange={handleOptionsChange}
                    placeholder={t("protocol.optionsPlaceholder")}
                    theme={theme}
                    t={t}
                  />
                )}
              </View>
            )}

            {needsItemFields && (
              <View style={styles.dialogInput}>
                <Text
                  variant="bodyMedium"
                  style={{ marginBottom: 8, color: theme.colors.onSurface }}
                >
                  {t("protocol.itemFields") + " *"}
                </Text>
                <Button
                  mode="outlined"
                  icon="format-list-group"
                  onPress={() => setItemFieldsDialogVisible(true)}
                  contentStyle={{ justifyContent: "flex-start" }}
                  style={{ width: "100%", borderRadius: BUTTON_RADIUS }}
                >
                  {`${t("protocol.manageItemFields")} (${fieldData.itemFields?.length || 0})`}
                </Button>
                <Text
                  variant="bodySmall"
                  numberOfLines={1}
                  style={{ marginTop: 6, color: theme.colors.onSurfaceVariant }}
                >
                  {fieldData.itemFields?.length
                    ? fieldData.itemFields.map((f: CustomFieldConfig) => f.label).join(", ")
                    : t("protocol.noItemFieldsAdded")}
                </Text>

                {/* Own Dialog + own Portal (see ItemFieldsManagerDialog above),
                    only mounted while open - same pattern as OptionsManagerDialog. */}
                {itemFieldsDialogVisible && (
                  <ItemFieldsManagerDialog
                    visible={itemFieldsDialogVisible}
                    onDismiss={() => setItemFieldsDialogVisible(false)}
                    itemFields={fieldData.itemFields || EMPTY_ITEM_FIELDS}
                    onChange={handleItemFieldsChange}
                    theme={theme}
                    t={t}
                  />
                )}
              </View>
            )}

            {(needsMin || needsMax) && (
              <View style={styles.row}>
                {needsMin && (
                  <TextInput
                    key={minInput.resetKey}
                    mode="outlined"
                    label={t("protocol.minimum")}
                    {...minInput.inputProps}
                    onFocus={(e: any) => {
                      minInput.onFocus();
                      handleFocus(e);
                    }}
                    keyboardType="numbers-and-punctuation"
                    autoComplete="off"
                    importantForAutofill="no"
                    style={[styles.dialogInput, { flex: 1, marginRight: 8 }]}
                  />
                )}
                {needsMax && (
                  <TextInput
                    key={maxInput.resetKey}
                    mode="outlined"
                    label={
                      fieldData.type === "rating"
                        ? t("protocol.maximum") + " *"
                        : t("protocol.maximum")
                    }
                    {...maxInput.inputProps}
                    onFocus={(e: any) => {
                      maxInput.onFocus();
                      handleFocus(e);
                    }}
                    keyboardType="numeric"
                    autoComplete="off"
                    importantForAutofill="no"
                    style={[styles.dialogInput, { flex: 1 }]}
                  />
                )}
              </View>
            )}

            {needsUnit && (
              <>
                <Button
                  mode="outlined"
                  onPress={() => setUnitDialogVisible(true)}
                  contentStyle={{ justifyContent: "flex-start" }}
                  style={[styles.dialogInput, { width: "100%", borderRadius: BUTTON_RADIUS }]}
                >
                  {unitIsCustom
                    ? t("protocol.customUnit")
                    : fieldData.unit
                      ? fieldData.unit
                      : t("protocol.selectUnit")}
                </Button>

                {/* Own Dialog + own Portal (see UnitSelectionDialog above),
                    only mounted while open - same pattern as
                    TypeSelectionDialog, avoids nesting a Menu's Modal
                    inside this Dialog's Modal. */}
                {unitDialogVisible && (
                  <UnitSelectionDialog
                    visible={unitDialogVisible}
                    onDismiss={() => setUnitDialogVisible(false)}
                    onSelectUnit={handleUnitSelect}
                    onSelectCustom={handleCustomUnitSelect}
                    selectedUnit={fieldData.unit}
                    isCustom={unitIsCustom}
                    theme={theme}
                    t={t}
                  />
                )}
                {unitIsCustom && (
                  <TextInput
                    key={unitInput.resetKey}
                    mode="outlined"
                    label={t("protocol.customUnit")}
                    {...unitInput.inputProps}
                    onFocus={(e: any) => {
                      unitInput.onFocus();
                      handleFocus(e);
                    }}
                    placeholder={t("protocol.customUnitPlaceholder")}
                    autoCorrect={false}
                    spellCheck={false}
                    autoComplete="off"
                    importantForAutofill="no"
                    style={styles.dialogInput}
                  />
                )}
              </>
            )}

            <Text
              variant="labelLarge"
              style={{ marginTop: 8, marginBottom: 8 }}
            >
              {t("protocol.requiredField")}
            </Text>
            <SegmentedButtons
              theme={SEGMENTED_BUTTONS_SHAPE_THEME}
              value={fieldData.required ? "yes" : "no"}
              onValueChange={(value) =>
                onFieldDataChange({ ...fieldData, required: value === "yes" })
              }
              buttons={[
                { value: "no", label: t("common.no") },
                { value: "yes", label: t("common.yes") },
              ]}
              style={styles.dialogInput}
            />
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Button onPress={onDismiss}>{t("common.cancel")}</Button>
          <Button mode="contained" onPress={validateAndSave} style={{ borderRadius: BUTTON_RADIUS }}>
            {t("common.save")}
          </Button>
        </Dialog.Actions>
      </Dialog>
      {!!validationMessage && (
        <FieldValidationAlert
          message={validationMessage}
          onDismiss={() => setValidationMessage("")}
          theme={theme}
          t={t}
        />
      )}
    </Portal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  card: {
    marginBottom: 16,
  },
  input: {
    marginBottom: 12,
  },
  sectionCard: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 16,
    minHeight: 72,
  },
  sectionHeaderTitle: {
    flex: 1,
    paddingRight: 16,
  },
  fieldCard: {
    marginBottom: 8,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  fieldActions: {
    flexDirection: "row",
  },
  addSectionButton: {
    marginBottom: 16,
  },
  dialogInput: {
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 12,
  },
});
