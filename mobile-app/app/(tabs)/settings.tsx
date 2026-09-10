import React, { useEffect, useState } from "react";
import { View, StyleSheet, ScrollView, Linking } from "react-native";
import {
  List,
  Switch,
  Text,
  Divider,
  useTheme as usePaperTheme,
  Dialog,
  Portal,
  RadioButton,
  Button,
  MD3Theme,
} from "react-native-paper";
import { Stack, router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/contexts/theme-context";
import { useI18n } from "@/contexts/i18n-context";
import { getAvailableLanguages } from "@/utils/i18n";
import { useDialog, useAlertDialog } from "@/hooks/use-dialog";
import { useGoogleAccount } from "@/hooks/use-google-account";
import { APIKeyManager } from "@/core/species-catalog/api-key-manager";
import { SpeciesLinkSettingsModal } from "@/components/settings/SpeciesLinkSettingsModal";
import { GoogleAccountSettingsModal } from "@/components/settings/GoogleAccountSettingsModal";

function StatusIndicator({ active, label, theme }: { active: boolean; label: string; theme: MD3Theme }) {
  return (
    <View accessibilityLabel={label} accessibilityRole="image">
      <MaterialCommunityIcons
        name={active ? "check-circle" : "close-circle-outline"}
        size={22}
        color={active ? (theme.dark ? "#a5d6a7" : "#2e7d32") : theme.colors.onSurfaceVariant}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const paperTheme = usePaperTheme();
  const { isDarkMode, toggleTheme } = useTheme();
  const { currentLanguage, setLanguage, t } = useI18n();
  const { showDialog } = useDialog();
  const { alert } = useAlertDialog();
  const {
    account: googleAccount,
    isConnecting: isConnectingGoogle,
    error: googleError,
    connect: connectGoogle,
    disconnect: disconnectGoogle,
  } = useGoogleAccount();
  const [languageDialogVisible, setLanguageDialogVisible] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(currentLanguage);
  const [speciesLinkModalVisible, setSpeciesLinkModalVisible] = useState(false);
  const [googleAccountModalVisible, setGoogleAccountModalVisible] = useState(false);
  const [speciesLinkConfigured, setSpeciesLinkConfigured] = useState(false);

  const availableLanguages = getAvailableLanguages();

  const refreshSpeciesLinkStatus = () => {
    APIKeyManager.hasSpeciesLinkApiKey().then(setSpeciesLinkConfigured);
  };

  useEffect(() => {
    refreshSpeciesLinkStatus();
  }, []);

  const openGitHub = () => {
    Linking.openURL("https://github.com/pablonvsx/nomos");
  };

  const openDrive = () => {
    Linking.openURL(
      "https://drive.google.com/drive/folders/1Ikc18svAf_pBV3j8QSXvILa6XqKRPcRI?usp=sharing"
    );
  };

  const handleLanguageChange = async () => {
    if (selectedLanguage !== currentLanguage) {
      // Get translations for the NEW language before switching
      const locales = {
        pt: require("@/locales/pt.json"),
        en: require("@/locales/en.json"),
        es: require("@/locales/es.json"),
        fr: require("@/locales/fr.json"),
      };
      const newLocale = locales[selectedLanguage as keyof typeof locales];

      // Change language first
      await setLanguage(selectedLanguage);
      setLanguageDialogVisible(false);

      // Navigate to home screen to ensure everything is re-rendered
      router.replace("/");

      // Show dialog in the NEW language after navigation
      setTimeout(() => {
        showDialog({
          title: newLocale.settings.languageChanged,
          message: newLocale.settings.languageChangedDesc,
          buttons: [{ label: newLocale.common.ok, onPress: () => {} }],
        });
      }, 300);
    } else {
      setLanguageDialogVisible(false);
    }
  };

  return (
    <ScrollView
      style={[
        styles.container,
        { backgroundColor: paperTheme.colors.background },
      ]}
    >
      <Stack.Screen options={{ title: t("settings.title") }} />

      <View style={styles.content}>
        {/* Header Section */}
        <View style={styles.headerContainer}>
          <MaterialCommunityIcons
            name="cog-outline"
            size={64}
            color={paperTheme.colors.primary}
          />
          <Text
            variant="headlineMedium"
            style={[styles.title, { color: paperTheme.colors.onBackground }]}
          >
            {t("settings.title")}
          </Text>
          <Text
            variant="bodyMedium"
            style={[styles.subtitle, { color: paperTheme.colors.secondary }]}
          >
            {t("settings.subtitle")}
          </Text>
        </View>

        {/* SECTION 1: APPEARANCE */}
        <List.Section>
          <List.Subheader
            style={[styles.subheader, { color: paperTheme.colors.primary }]}
          >
            {t("settings.appearance")}
          </List.Subheader>

          <List.Item
            title={t("settings.darkMode")}
            description={t("settings.darkModeDesc")}
            left={(props) => <List.Icon {...props} icon="theme-light-dark" />}
            right={() => (
              <Switch
                value={isDarkMode}
                onValueChange={toggleTheme}
                color={paperTheme.colors.primary}
              />
            )}
            titleStyle={styles.itemTitle}
          />

          <List.Item
            title={t("settings.language")}
            description={t("settings.languageDesc")}
            left={(props) => <List.Icon {...props} icon="translate" />}
            right={() => (
              <Text style={styles.languageValue}>
                {
                  availableLanguages.find((l) => l.code === currentLanguage)
                    ?.nativeName
                }
              </Text>
            )}
            onPress={() => {
              setSelectedLanguage(currentLanguage);
              setLanguageDialogVisible(true);
            }}
            titleStyle={styles.itemTitle}
          />
        </List.Section>

        <Divider />

        {/* SECTION 3: GOOGLE ACCOUNT */}
        <List.Section>
          <List.Subheader
            style={[styles.subheader, { color: paperTheme.colors.primary }]}
          >
            {t("settings.googleAccountTitle")}
          </List.Subheader>

          <List.Item
            title={t("settings.googleAccountDescription")}
            left={(props) => <List.Icon {...props} icon="google" />}
            right={() => (
              <StatusIndicator
                active={!!googleAccount}
                label={
                  googleAccount
                    ? t("settings.connected")
                    : t("settings.notConnected")
                }
                theme={paperTheme}
              />
            )}
            onPress={() => setGoogleAccountModalVisible(true)}
            titleStyle={styles.itemTitle}
          />
        </List.Section>

        <Divider />

        {/* SECTION 4: SPECIES LINK API */}
        <List.Section>
          <List.Subheader
            style={[styles.subheader, { color: paperTheme.colors.primary }]}
          >
            {t("species.speciesLinkIntegration")}
          </List.Subheader>

          <List.Item
            title={t("species.speciesLinkDescription")}
            left={(props) => <List.Icon {...props} icon="link-variant" />}
            right={() => (
              <StatusIndicator
                active={speciesLinkConfigured}
                label={
                  speciesLinkConfigured
                    ? t("species.configured")
                    : t("species.notConfigured")
                }
                theme={paperTheme}
              />
            )}
            onPress={() => setSpeciesLinkModalVisible(true)}
            titleStyle={styles.itemTitle}
          />
        </List.Section>

        <Divider />

        {/* SECTION 4: SYSTEM INFO */}
        <List.Section>
          <List.Subheader
            style={[styles.subheader, { color: paperTheme.colors.primary }]}
          >
            {t("settings.systemInfo")}
          </List.Subheader>
          <List.Item
            title={t("settings.appVersion")}
            description={t("home.version")}
            left={(props) => <List.Icon {...props} icon="information" />}
          />
          <List.Item
            title={t("settings.database")}
            description="SQLite 3.45 (Local)"
            left={(props) => <List.Icon {...props} icon="database" />}
          />
          <List.Item
            title={t("settings.codeDocsTitle")}
            description={
              <Text variant="bodySmall" style={styles.itemDescription}>
                GitHub: {" "}
                <Text style={{ color: paperTheme.colors.primary }}>
                  pablonvsx/nomos
                </Text>
              </Text>
            }
            left={(props) => <List.Icon {...props} icon="open-in-new" />}
            onPress={openGitHub}
            titleStyle={styles.itemTitle}
            descriptionStyle={styles.itemDescription}
            descriptionNumberOfLines={0}
          />
          <List.Item
            title={t("settings.driveTitle")}
            description={
              <Text variant="bodySmall" style={styles.itemDescription}>
                Google Drive: {" "}
                <Text style={{ color: paperTheme.colors.primary }}>
                  {t("settings.driveAccess")}
                </Text>
              </Text>
            }
            left={(props) => <List.Icon {...props} icon="google-drive" />}
            onPress={openDrive}
            titleStyle={styles.itemTitle}
            descriptionStyle={styles.itemDescription}
            descriptionNumberOfLines={0}
          />
        </List.Section>

      </View>

      {/* Language Selection Dialog */}
      <Portal>
        <Dialog
          visible={languageDialogVisible}
          onDismiss={() => setLanguageDialogVisible(false)}
        >
          <Dialog.Title>{t("settings.language")}</Dialog.Title>
          <Dialog.Content>
            <RadioButton.Group
              onValueChange={(value) => setSelectedLanguage(value)}
              value={selectedLanguage}
            >
              {availableLanguages.map((lang) => (
                <RadioButton.Item
                  key={lang.code}
                  label={`${lang.nativeName}, ${lang.code}`}
                  value={lang.code}
                  position="leading"
                />
              ))}
            </RadioButton.Group>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setLanguageDialogVisible(false)}>
              {t("common.cancel")}
            </Button>
            <Button onPress={handleLanguageChange}>
              {t("common.confirm")}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* SpeciesLink Settings Modal */}
      <SpeciesLinkSettingsModal
        visible={speciesLinkModalVisible}
        onDismiss={() => {
          setSpeciesLinkModalVisible(false);
          refreshSpeciesLinkStatus();
        }}
      />

      {/* Google Account Settings Modal */}
      <GoogleAccountSettingsModal
        visible={googleAccountModalVisible}
        onDismiss={() => setGoogleAccountModalVisible(false)}
        account={googleAccount}
        isConnecting={isConnectingGoogle}
        error={googleError}
        onConnect={connectGoogle}
        onDisconnect={disconnectGoogle}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingVertical: 10,
  },
  headerContainer: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  title: {
    marginTop: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 16,
  },
  subheader: {
    fontWeight: "bold",
    fontSize: 14,
  },
  itemTitle: {
    fontSize: 16,
    textAlign: "justify",
  },
  itemDescription: {
    textAlign: "justify",
  },
  languageValue: {
    fontSize: 14,
    marginRight: 8,
    opacity: 0.7,
  },
});
