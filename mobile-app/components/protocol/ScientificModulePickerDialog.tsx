import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Dialog, Divider, Icon, Portal, Text, useTheme } from "react-native-paper";
import { ModalActions } from "@/components/ui/ModalActions";
import { MODAL_SCROLL_AREA_STYLE } from "@/constants/modal-layout";
import { MODAL_TITLE_STYLE } from "@/constants/modal-title";
import { NATIVE_PROTOCOLS_CATALOG } from "@/constants/native-protocols-catalog";
import { BUTTON_RADIUS, MODAL_SHAPE_STYLE } from "@/constants/shape";
import { dialogMaxHeight, isScrollable } from "@/core/ui/dialog-layout";
import type { SharedModuleCatalogEntry } from "@/modules/registry";
import { ModalTitle } from "@/components/ui/ModalBody";

interface ScientificModulePickerDialogProps {
  visible: boolean;
  onDismiss: () => void;
  modules: SharedModuleCatalogEntry[];
  lang: string;
  onSelect: (entry: SharedModuleCatalogEntry) => void;
  t: (key: string) => string;
}

const CARD_GAP = 12;
const ICON_BADGE_SIZE = 40;
// Android's minimum recommended touch target.
const MIN_TOUCH_TARGET = 48;

/**
 * Picker for attaching a prefab scientific module (modules/registry.ts) to a
 * custom protocol. Own Portal + own Dialog, like the other pickers in the
 * builder: the app-wide DialogProvider's Portal is mounted at the root, so a
 * dialog opened from there would stack behind the builder's own Portals.
 *
 * Each module is a tappable card. The dialog is as tall as its content, up to
 * dialogMaxHeight, and only then scrolls (the scroll area must not grow on its
 * own, or an empty band shows above the footer).
 */
export function ScientificModulePickerDialog({
  visible,
  onDismiss,
  modules,
  lang,
  onSelect,
  t,
}: ScientificModulePickerDialogProps) {
  const theme = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const scrolls = isScrollable(contentHeight, viewportHeight);

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

  // The scroll area is line-free like every dialog's (MODAL_SCROLL_AREA_STYLE);
  // frame lines are added only while there is more to scroll to, to tell the
  // user the list continues.
  const scrollFrame = {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: theme.colors.outlineVariant,
    borderBottomColor: theme.colors.outlineVariant,
  };

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={onDismiss}
        style={[MODAL_SHAPE_STYLE, { maxHeight: dialogMaxHeight(windowHeight) }]}
      >
        <ModalTitle style={MODAL_TITLE_STYLE} numberOfLines={2} accessibilityRole="header">
          {t("protocol.selectScientificModule")}
        </ModalTitle>
        <Dialog.ScrollArea style={[styles.scrollArea, MODAL_SCROLL_AREA_STYLE, scrolls && scrollFrame]}>
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[styles.content, scrolls && styles.contentScrolling]}
            persistentScrollbar
            showsVerticalScrollIndicator
            onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
            onContentSizeChange={(_, h) => setContentHeight(h)}
          >
            {modules.length === 0 ? (
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {t("protocol.noScientificModulesAvailable")}
              </Text>
            ) : (
              groups.map((group, groupIndex) => (
                <View key={group.protocolName} style={groupIndex > 0 ? styles.nextGroup : undefined}>
                  <Text
                    variant="labelLarge"
                    accessibilityRole="header"
                    style={[styles.groupLabel, { color: theme.colors.primary }]}
                  >
                    {group.protocolName}
                  </Text>
                  <Divider style={styles.groupDivider} />
                  <View style={styles.cards}>
                  {group.entries.map((entry) => {
                    const title = entry.descriptor.title[lang] ?? entry.descriptor.title.pt ?? entry.descriptor.id;
                    const descriptionText = NATIVE_PROTOCOLS_CATALOG[entry.protocolId]?.modules.find(
                      (m) => m.id === entry.descriptor.id,
                    )?.description;
                    const description = descriptionText ? (descriptionText[lang] ?? descriptionText.pt) : undefined;
                    return (
                      <Pressable
                        key={entry.descriptor.id}
                        onPress={() => onSelect(entry)}
                        accessibilityRole="button"
                        accessibilityLabel={description ? `${title}. ${description}` : title}
                        android_ripple={{ color: theme.colors.surfaceVariant }}
                        style={[
                          styles.card,
                          {
                            backgroundColor: theme.colors.elevation.level1,
                            borderColor: theme.colors.outlineVariant,
                          },
                        ]}
                      >
                        <View style={styles.cardHeader}>
                          <View style={[styles.iconBadge, { backgroundColor: theme.colors.primaryContainer }]}>
                            <Icon source="flask-outline" size={22} color={theme.colors.onPrimaryContainer} />
                          </View>
                          <Text variant="titleMedium" style={styles.cardTitle}>
                            {title}
                          </Text>
                          <Icon source="plus" size={22} color={theme.colors.primary} />
                        </View>
                        {description && (
                          <Text
                            variant="bodySmall"
                            // Hyphenation lets the justified lines break inside long words
                            // instead of stretching the gaps between words.
                            android_hyphenationFrequency="full"
                            style={[styles.cardDescription, { color: theme.colors.onSurfaceVariant }]}
                          >
                            {description}
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </Dialog.ScrollArea>
        <ModalActions confirmLabel={t("common.close")} onConfirm={onDismiss} />
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  // Paper's ScrollArea and the ScrollView both default to flexGrow: 1; either
  // one would stretch past the content and leave an empty band above the footer.
  scrollArea: { paddingHorizontal: 0, flexGrow: 0 },
  scrollView: { flexGrow: 0 },
  // Only breathing room against the frame lines; with no scrolling the content sits flush
  // against the title gap above and the footer's own gap below.
  content: { paddingHorizontal: 16 },
  contentScrolling: { paddingVertical: 12 },
  nextGroup: { marginTop: 16 },
  groupLabel: { paddingTop: 4, paddingBottom: 8 },
  groupDivider: { marginBottom: CARD_GAP },
  cards: { gap: CARD_GAP },
  card: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: BUTTON_RADIUS,
    borderWidth: 1,
    padding: 12,
    overflow: "hidden",
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBadge: {
    width: ICON_BADGE_SIZE,
    height: ICON_BADGE_SIZE,
    borderRadius: BUTTON_RADIUS,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { flex: 1 },
  cardDescription: { marginTop: 8, textAlign: "justify" },
});
