import React from "react";
import { View, StyleSheet, Image } from "react-native";
import { Text, Button, useTheme as usePaperTheme } from "react-native-paper";
import { useRouter } from "expo-router";
import { useI18n } from "@/contexts/i18n-context";

export default function LandingScreen() {
  const router = useRouter();
  const paperTheme = usePaperTheme();
  const { t } = useI18n();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: paperTheme.colors.background },
      ]}
    >
      {/* 1. HEADER SECTION (Logo & Title) */}
      <View style={styles.headerContainer}>
        <View style={styles.iconContainer}>
          <Image
            source={require("../../assets/images/logo/nomos-logo-master.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <Text
          variant="headlineSmall"
          style={[styles.title, { color: paperTheme.colors.secondary }]}
        >
          {t("home.title")}
        </Text>
        <Text
          variant="titleMedium"
          style={[styles.subtitle, { color: paperTheme.colors.secondary }]}
        >
          {t("home.subtitle")}
        </Text>
      </View>

      {/* 2. ACTIONS SECTION (Navigation Buttons) */}
      <View style={styles.actionsContainer}>
        {/* Button: Navigate to Projects List */}
        <Button
          mode="contained"
          icon="folder-open"
          style={styles.button}
          contentStyle={styles.buttonContent}
          onPress={() => router.push("/projects")}
        >
          {t("home.myProjects")}
        </Button>

        {/* Button: Navigate to About Screen */}
        <Button
          mode="outlined"
          icon="information-outline"
          style={styles.button}
          contentStyle={styles.buttonContent}
          onPress={() => router.push("/about")}
        >
          {t("home.about")}
        </Button>
      </View>

      {/* 3. FOOTER SECTION (Authorship & Version) */}
      <View style={styles.footerContainer}>
        <Text
          variant="bodySmall"
          style={[styles.footerText, { color: paperTheme.colors.onSurface }]}
        >
          {t("home.footer")}
        </Text>
        <Text
          variant="labelSmall"
          style={[
            styles.institutionText,
            { color: paperTheme.colors.secondary },
          ]}
        >
          {t("home.institution")}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "space-between", // Distributes space: Header top, Actions middle, Footer bottom
  },
  headerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 80,
  },
  iconContainer: {
    paddingHorizontal: 18,
    borderRadius: 24,
  },
  logo: {
    width: 220,
    height: 220,
  },
  title: {
    textAlign: "center",
    fontWeight: "800",
    fontSize: 18,
  },
  subtitle: {
    textAlign: "center",
    fontWeight: "500",
    marginTop: 2,
  },
  actionsContainer: {
    flex: 1,
    justifyContent: "flex-start",
    width: "100%",
    paddingHorizontal: 20,
    marginTop: 48,
    gap: 16,
  },
  button: {
    borderRadius: 8,
    width: "100%",
  },
  buttonContent: {
    height: 56, 
  },
  footerContainer: {
    alignItems: "center",
    paddingBottom: 1,
  },
  footerText: {
    fontWeight: "500",
  },
  institutionText: {
    marginTop: 2,
  },
});
