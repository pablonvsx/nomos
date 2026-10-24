import React from "react";
import { View, StyleSheet, ScrollView, Linking } from "react-native";
import { Text, Button, Divider, List, useTheme as usePaperTheme } from "react-native-paper";
import * as Clipboard from "expo-clipboard";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useI18n } from "@/contexts/i18n-context";
import { useAlertDialog } from "@/hooks/use-dialog";
import { BUTTON_RADIUS } from "@/constants/shape";
import { PROJECT_PAGE_URL, ZENODO_DOI, ZENODO_DOI_URL } from "@/constants/links";
import { APP_VERSION_LABEL } from "@/constants/app-version";
import { CITATION_YEAR, formatAuthorAbnt } from "@/utils/citation";
import { openExternalUrl } from "@/utils/open-external-url";

export default function ResourcesScreen() {
  const paperTheme = usePaperTheme();
  const { t } = useI18n();
  const { alert } = useAlertDialog();

  // Opened only on tap: the app is offline-first, nothing depends on this link.
  const openSite = async () => {
    const opened = await openExternalUrl(PROJECT_PAGE_URL, (url) => Linking.openURL(url));
    if (!opened) {
      alert(t("resources.openErrorTitle"), t("resources.openError"));
    }
  };

  const citation = t("resources.citeReference", {
    author: formatAuthorAbnt(t("about.authorName")),
    year: String(CITATION_YEAR),
    doi: ZENODO_DOI,
  });

  // Opened only on tap: the app is offline-first, nothing depends on this link.
  const openDoi = async () => {
    const opened = await openExternalUrl(ZENODO_DOI_URL, (url) => Linking.openURL(url));
    if (!opened) {
      alert(t("common.error"), t("resources.openDoiError"));
    }
  };

  const copyCitation = async () => {
    await Clipboard.setStringAsync(citation);
    alert(t("common.success"), t("resources.copied"));
  };

  return (
    <ScrollView
      style={[
        styles.container,
        { backgroundColor: paperTheme.colors.background },
      ]}
    >
      <View style={styles.content}>
        <View style={styles.headerContainer}>
          <MaterialCommunityIcons
            name="book-open-variant"
            size={64}
            color={paperTheme.colors.primary}
          />
          <Text
            variant="headlineMedium"
            style={[styles.title, { color: paperTheme.colors.onBackground }]}
          >
            {t("resources.title")}
          </Text>
        </View>

        <Text
          variant="bodyMedium"
          style={[styles.paragraph, { color: paperTheme.colors.onSurface }]}
        >
          {t("resources.intro")}
        </Text>

        <Button
          mode="contained"
          icon="open-in-new"
          style={[styles.siteButton, { borderRadius: BUTTON_RADIUS }]}
          accessibilityLabel={t("resources.openSiteA11y")}
          onPress={openSite}
        >
          {t("resources.openSite")}
        </Button>

        <Text
          variant="bodyMedium"
          style={[styles.version, { color: paperTheme.colors.onSurfaceVariant }]}
        >
          {t("resources.installedVersion", { version: APP_VERSION_LABEL })}
        </Text>

        {/* How to cite */}
        <View style={styles.section}>
          <Text
            variant="titleMedium"
            style={[styles.sectionTitle, { color: paperTheme.colors.primary }]}
          >
            {t("resources.cite")}
          </Text>
          <Divider style={styles.divider} />

          <List.Item
            title={t("resources.citeDesc")}
            description={
              <Text
                selectable
                variant="bodyMedium"
                style={{ color: paperTheme.colors.onSurfaceVariant }}
              >
                {citation}
              </Text>
            }
            left={(props) => <List.Icon {...props} icon="format-quote-close" />}
            titleStyle={styles.listItemTitle}
            titleNumberOfLines={0}
            descriptionNumberOfLines={0}
          />
          <View style={styles.citeButtons}>
            <Button
              mode="outlined"
              compact
              onPress={openDoi}
              icon="open-in-new"
              style={{ borderRadius: BUTTON_RADIUS }}
            >
              {t("resources.openDoi")}
            </Button>
            <Button
              mode="outlined"
              compact
              onPress={copyCitation}
              icon="content-copy"
              style={{ borderRadius: BUTTON_RADIUS }}
            >
              {t("resources.copyReference")}
            </Button>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  headerContainer: {
    alignItems: "center",
    marginBottom: 24,
    marginTop: 20,
  },
  title: {
    fontWeight: "bold",
    marginTop: 12,
    textAlign: "center",
  },
  paragraph: {
    lineHeight: 22,
    textAlign: "left",
    marginBottom: 16,
  },
  siteButton: {
    marginTop: 8,
  },
  section: {
    marginTop: 32,
  },
  sectionTitle: {
    fontWeight: "bold",
    marginBottom: 8,
  },
  divider: {
    marginBottom: 8,
  },
  listItemTitle: {
    fontWeight: "bold",
    fontSize: 14,
  },
  citeButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 8,
  },
  version: {
    marginTop: 32,
    textAlign: "center",
  },
});
