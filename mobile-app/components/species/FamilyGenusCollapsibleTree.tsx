import React from "react";
import { View, StyleSheet, Pressable } from "react-native";
import { Text, IconButton, useTheme } from "react-native-paper";
import {
  TaxonomyFamilyGroup,
  TaxonomyGenusGroup,
  familyGenusKey,
} from "@/core/species-catalog/group-by-taxonomy";

interface FamilyGenusCollapsibleTreeProps<T> {
  groups: TaxonomyFamilyGroup<T>[];
  expandedFamilies: Set<string>;
  expandedGenera: Set<string>;
  onToggleFamily: (family: string) => void;
  onToggleGenus: (genusFamilyKey: string) => void;
  keyOf: (item: T) => string | number;
  renderItem: (item: T) => React.ReactNode;
  familyMeta: (group: TaxonomyFamilyGroup<T>) => string;
  genusMeta: (group: TaxonomyGenusGroup<T>) => string;
}

export default function FamilyGenusCollapsibleTree<T>({
  groups,
  expandedFamilies,
  expandedGenera,
  onToggleFamily,
  onToggleGenus,
  keyOf,
  renderItem,
  familyMeta,
  genusMeta,
}: FamilyGenusCollapsibleTreeProps<T>) {
  const theme = useTheme();

  return (
    <>
      {groups.map((familyGroup) => (
        <View key={familyGroup.family} style={styles.familyGroup}>
          <Pressable
            onPress={() => onToggleFamily(familyGroup.family)}
            style={[styles.familyHeader, { backgroundColor: theme.colors.surfaceVariant }]}
          >
            <View style={styles.familyHeaderContent}>
              <IconButton
                icon={expandedFamilies.has(familyGroup.family) ? "chevron-down" : "chevron-right"}
                size={24}
                iconColor={theme.colors.primary}
              />
              <View style={{ flex: 1 }}>
                <Text variant="titleSmall" style={{ color: theme.colors.primary, fontWeight: "600" }}>
                  {familyGroup.family}
                </Text>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {familyMeta(familyGroup)}
                </Text>
              </View>
            </View>
          </Pressable>

          {expandedFamilies.has(familyGroup.family) && (
            <View style={styles.speciesListInFamily}>
              {familyGroup.genera.map((genusGroup) => {
                const key = familyGenusKey(familyGroup.family, genusGroup.genus);
                return (
                  <View key={key}>
                    <Pressable
                      onPress={() => onToggleGenus(key)}
                      style={[styles.genusHeader, { backgroundColor: theme.colors.surface }]}
                    >
                      <IconButton
                        icon={expandedGenera.has(key) ? "chevron-down" : "chevron-right"}
                        size={20}
                        iconColor={theme.colors.secondary}
                      />
                      <View style={{ flex: 1 }}>
                        <Text variant="labelLarge" style={{ color: theme.colors.secondary, fontWeight: "500" }}>
                          {genusGroup.genus}
                        </Text>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          {genusMeta(genusGroup)}
                        </Text>
                      </View>
                    </Pressable>

                    {expandedGenera.has(key) && (
                      <View style={styles.speciesListInGenus}>
                        {genusGroup.items.map((item) => (
                          <React.Fragment key={keyOf(item)}>{renderItem(item)}</React.Fragment>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  familyGroup: {
    marginBottom: 16,
  },
  familyHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 0,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 8,
  },
  familyHeaderContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  speciesListInFamily: {
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: "rgba(0, 0, 0, 0.1)",
  },
  genusHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 0,
    paddingVertical: 6,
    borderRadius: 6,
    marginBottom: 8,
    marginLeft: 8,
  },
  speciesListInGenus: {
    paddingLeft: 16,
    borderLeftWidth: 2,
    borderLeftColor: "rgba(0, 0, 0, 0.05)",
  },
});
