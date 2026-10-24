import React from "react";
import { View, StyleSheet, ScrollView, Linking } from "react-native";
import { Text, Button, useTheme as usePaperTheme } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useI18n } from "@/contexts/i18n-context";
import { useAlertDialog } from "@/hooks/use-dialog";
import { BUTTON_RADIUS } from "@/constants/shape";
import { PROJECT_PAGE_URL } from "@/constants/links";
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
          variant="bodySmall"
          style={[styles.hint, { color: paperTheme.colors.onSurfaceVariant }]}
        >
          {t("resources.requiresInternet")}
        </Text>

        <Text
          variant="bodyMedium"
          style={[styles.version, { color: paperTheme.colors.onSurfaceVariant }]}
        >
          {t("resources.installedVersion", { version: t("home.version") })}
        </Text>
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
  hint: {
    marginTop: 8,
    textAlign: "center",
  },
  version: {
    marginTop: 32,
    textAlign: "center",
  },
});
