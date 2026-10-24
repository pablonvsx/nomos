import React from "react";
import { View, StyleSheet, ScrollView, Linking, Image } from "react-native";
import {
  Text,
  Card,
  Divider,
  List,
  useTheme as usePaperTheme,
  Button,
} from "react-native-paper";
import { Stack } from "expo-router";
import { useI18n } from "../contexts/i18n-context";
import { BUTTON_RADIUS } from "@/constants/shape";
import { useBottomContentPadding } from "@/hooks/use-bottom-content-padding";

export default function AboutScreen() {
  const paperTheme = usePaperTheme();
  const bottomPadding = useBottomContentPadding();
  const { t } = useI18n();

  const openLicenseLink = () => {
    Linking.openURL("https://www.gnu.org/licenses/gpl-3.0.html");
  };

  const authorLinks = {
    pablo: {
      researchgate: "https://www.researchgate.net/profile/Pablo-Neves-2",
      lattes: "http://lattes.cnpq.br/0232693906809043",
      github: "https://github.com/pablonvsx",
    },
    lucas: {
      researchgate: "https://www.researchgate.net/profile/Lucas-Cavalcanti-7",
      lattes: "http://lattes.cnpq.br/0571151043430712",
    },
  };

  const institutionLinks = {
    ufpe: "https://www.ufpe.br/",
    ufpeInstagram: "https://www.instagram.com/ufpe.oficial",
    paisageo: "https://sites.ufpe.br/paisageo/",
    paisageoInstagram: "https://www.instagram.com/paisageo.ufpe",
  };

  return (
    <ScrollView
      style={[
        styles.container,
        { backgroundColor: paperTheme.colors.background },
      ]}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
    >
      {/* Configures the Stack Header for this screen */}
      <Stack.Screen
        options={{ title: t("about.title"), headerBackTitle: "" }}
      />

      {/* 1. HEADER SECTION */}
      <View style={styles.headerContainer}>
        <View
          style={[
            styles.logoBadge,
            {
              backgroundColor: paperTheme.colors.surface,
              borderColor: paperTheme.colors.outlineVariant,
            },
          ]}
        >
          <Image
            source={require("../assets/images/logo/nomos-logo-master.png")}
            style={styles.headerLogo}
            resizeMode="contain"
          />
        </View>
        <View style={styles.headerTextContainer}>
          <Text
            variant="headlineMedium"
            style={[styles.header, { color: paperTheme.colors.onBackground }]}
          >
            {t("home.title")}
          </Text>
          <Text
            variant="titleMedium"
            style={[styles.subHeader, { color: paperTheme.colors.secondary }]}
          >
            {t("about.subtitle")}
          </Text>
        </View>
      </View>

      {/* 2. PROJECT DESCRIPTION */}
      <Card
        style={[styles.card, { backgroundColor: paperTheme.colors.surface }]}
      >
        <Card.Content>
          <Text
            variant="bodyMedium"
            style={[styles.paragraph, { color: paperTheme.colors.onSurface }]}
          >
            {t("about.description")}
          </Text>
        </Card.Content>
      </Card>

      {/* 3. ACADEMIC CREDITS SECTION */}
      <View style={styles.section}>
        <Text
          variant="titleMedium"
          style={[styles.sectionTitle, { color: paperTheme.colors.primary }]}
        >
          {t("about.credits")}
        </Text>
        <Divider style={styles.divider} />

        <List.Item
          title={t("about.author")}
          description={t("about.authorName")}
          left={(props) => <List.Icon {...props} icon="account" />}
          titleStyle={styles.listItemTitle}
          descriptionStyle={styles.listItemDescription}
          descriptionNumberOfLines={0}
        />
        <View style={styles.linkRow}>
          <Button compact mode="text" icon="open-in-new" onPress={() => Linking.openURL(authorLinks.pablo.researchgate)}>
            ResearchGate
          </Button>
          <Button compact mode="text" icon="open-in-new" onPress={() => Linking.openURL(authorLinks.pablo.lattes)}>
            Lattes
          </Button>
          <Button compact mode="text" icon="open-in-new" onPress={() => Linking.openURL(authorLinks.pablo.github)}>
            GitHub
          </Button>
        </View>
        <List.Item
          title={t("about.advisor")}
          description={t("about.advisorName")}
          left={(props) => <List.Icon {...props} icon="school" />}
          titleStyle={styles.listItemTitle}
          descriptionStyle={styles.listItemDescription}
          descriptionNumberOfLines={0}
        />
        <View style={styles.linkRow}>
          <Button compact mode="text" icon="open-in-new" onPress={() => Linking.openURL(authorLinks.lucas.researchgate)}>
            ResearchGate
          </Button>
          <Button compact mode="text" icon="open-in-new" onPress={() => Linking.openURL(authorLinks.lucas.lattes)}>
            Lattes
          </Button>
        </View>
        <List.Item
          title={t("about.institution")}
          description={t("about.institutionName")}
          left={(props) => <List.Icon {...props} icon="bank" />}
          titleStyle={styles.listItemTitle}
          descriptionStyle={styles.listItemDescription}
          descriptionNumberOfLines={0}
        />
        <View style={styles.linkRow}>
          <Button compact mode="text" icon="open-in-new" onPress={() => Linking.openURL(institutionLinks.ufpe)}>
            {t("about.institutionalWebsite")}
          </Button>
          <Button compact mode="text" icon="open-in-new" onPress={() => Linking.openURL(institutionLinks.ufpeInstagram)}>
            {t("about.socialMedia")}
          </Button>
        </View>
        <List.Item
          title={t("about.researchGroups")}
          description={t("about.researchGroupsName")}
          left={(props) => <List.Icon {...props} icon="account-group" />}
          titleStyle={styles.listItemTitle}
          descriptionStyle={styles.listItemDescription}
          descriptionNumberOfLines={0}
        />
        <View style={styles.linkRow}>
          <Button compact mode="text" icon="open-in-new" onPress={() => Linking.openURL(institutionLinks.paisageo)}>
            {t("about.institutionalWebsite")}
          </Button>
          <Button compact mode="text" icon="open-in-new" onPress={() => Linking.openURL(institutionLinks.paisageoInstagram)}>
            {t("about.socialMedia")}
          </Button>
        </View>
      </View>

      {/* 4. TECH STACK SECTION */}
      <View style={styles.section}>
        <Text
          variant="titleMedium"
          style={[styles.sectionTitle, { color: paperTheme.colors.primary }]}
        >
          {t("about.technology")}
        </Text>
        <Divider style={styles.divider} />

        <List.Item
          title={t("about.techDatabaseTitle")}
          description={t("about.techDatabaseDesc")}
          left={(props) => <List.Icon {...props} icon="database" />}
          titleStyle={styles.listItemTitle}
          descriptionStyle={styles.listItemDescription}
          descriptionNumberOfLines={0}
        />
        <List.Item
          title={t("about.techFrameworkTitle")}
          description={t("about.techFrameworkDesc")}
          left={(props) => <List.Icon {...props} icon="react" />}
          titleStyle={styles.listItemTitle}
          descriptionStyle={styles.listItemDescription}
          descriptionNumberOfLines={0}
        />
        <List.Item
          title={t("about.techArchitectureTitle")}
          description={t("about.techArchitectureDesc")}
          left={(props) => <List.Icon {...props} icon="sitemap" />}
          titleStyle={styles.listItemTitle}
          descriptionStyle={styles.listItemDescription}
          descriptionNumberOfLines={0}
        />
      </View>

      {/* 5. LICENSE SECTION */}
      <View style={styles.section}>
        <Text
          variant="titleMedium"
          style={[styles.sectionTitle, { color: paperTheme.colors.primary }]}
        >
          {t("about.license")}
        </Text>
        <Divider style={styles.divider} />

        <List.Item
          title={t("about.licenseName")}
          description={t("about.licenseDesc")}
          left={(props) => <List.Icon {...props} icon="shield-check-outline" />}
          titleStyle={styles.listItemTitle}
          descriptionStyle={styles.listItemDescription}
          descriptionNumberOfLines={0}
        />
        <Button
          mode="outlined"
          compact
          onPress={openLicenseLink}
          icon="open-in-new"
          style={[styles.licenseButton, { borderRadius: BUTTON_RADIUS }]}
        >
          {t("about.viewLicense")}
        </Button>
      </View>

      {/* 6. INSTITUTIONAL CREDITS FOOTER */}
      <View style={styles.footerSection}>
        <Text
          variant="titleMedium"
          style={[styles.sectionTitle, { color: paperTheme.colors.primary }]}
        >
          {t("about.institutionalCredits")}
        </Text>
        <Divider style={styles.divider} />

        <Text
          variant="bodyMedium"
          style={[styles.footerDescription, { color: paperTheme.colors.onSurface }]}
        >
          {t("about.institutionalCreditsDesc")}
        </Text>

        <View style={styles.logoRow}>
          <View
            style={[
              styles.institutionLogoCard,
              {
                backgroundColor: "#FFFFFF",
                borderColor: paperTheme.colors.outlineVariant,
              },
            ]}
          >
            <Image
              source={require("../assets/images/logos_insti/ufpe_logo.png")}
              style={[styles.institutionLogo, styles.institutionLogoUfpe]}
              resizeMode="contain"
            />
          </View>
          <View
            style={[
              styles.institutionLogoCard,
              {
                backgroundColor: "#FFFFFF",
                borderColor: paperTheme.colors.outlineVariant,
              },
            ]}
          >
            <Image
              source={require("../assets/images/logos_insti/capes_logo.png")}
              style={styles.institutionLogo}
              resizeMode="contain"
            />
          </View>
          <View
            style={[
              styles.institutionLogoCard,
              {
                backgroundColor: "#FFFFFF",
                borderColor: paperTheme.colors.outlineVariant,
              },
            ]}
          >
            <Image
              source={require("../assets/images/logos_insti/ppgeo_logo.png")}
              style={[styles.institutionLogo, styles.institutionLogoPpgeo]}
              resizeMode="contain"
            />
          </View>
          <View
            style={[
              styles.institutionLogoCard,
              {
                backgroundColor: "#FFFFFF",
                borderColor: paperTheme.colors.outlineVariant,
              },
            ]}
          >
            <Image
              source={require("../assets/images/logos_insti/intetropicos_logo.png")}
              style={[styles.institutionLogo, styles.institutionLogoIntertropicos]}
              resizeMode="contain"
            />
          </View>
          <View
            style={[
              styles.institutionLogoCard,
              {
                backgroundColor: "#FFFFFF",
                borderColor: paperTheme.colors.outlineVariant,
              },
            ]}
          >
            <Image
              source={require("../assets/images/logos_insti/paisageo.png")}
              style={[styles.institutionLogo, styles.institutionLogoPaisageo]}
              resizeMode="contain"
            />
          </View>
        </View>

        <Text
          variant="bodyMedium"
          style={[
            styles.footerCaption,
            { color: paperTheme.colors.onSurfaceVariant },
          ]}
        >
          {/* Institution names are intentionally not translated - always shown in pt-BR, their official form */}
          Universidade Federal de Pernambuco (UFPE), Programa de Pós-Graduação em Geografia (PPGEO), Coordenação de Aperfeiçoamento de Pessoal de Nível Superior (CAPES), Laboratório de Pesquisa em Dinâmicas de Paisagens Intertropicais (INTERTRÓPICOS) e Grupo de Pesquisa em Geografia e Conservação em Paisagens Tropicais (PAISAGEO).
        </Text>
      </View>

      {/* Bottom Padding */}
      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  headerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    gap: 12,
  },
  headerLogo: {
    width: 56,
    height: 56,
  },
  logoBadge: {
    width: 72,
    height: 72,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
  },
  headerTextContainer: {
    flex: 1,
  },
  header: {
    fontWeight: "bold",
    marginBottom: 2,
  },
  subHeader: {
    fontStyle: "italic",
  },
  card: {
    marginBottom: 24,
    elevation: 2,
  },
  paragraph: {
    lineHeight: 22,
    textAlign: "justify",
  },
  section: {
    marginBottom: 24,
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
    textAlign: "justify",
  },
  listItemDescription: {
    textAlign: "justify",
  },
  licenseButton: {
    alignSelf: "center",
    marginTop: 8,
  },
  linkRow: {
    flexDirection: "row",
    paddingLeft: 8,
    marginTop: -4,
    marginBottom: 4,
  },
  footerSection: {
    marginBottom: 24,
  },
  footerDescription: {
    lineHeight: 22,
    textAlign: "justify",
    marginBottom: 14,
  },
  logoRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  institutionLogoCard: {
    flexGrow: 1,
    minWidth: 92,
    minHeight: 72,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 12,
  },
  institutionLogo: {
    width: "100%",
    height: 42,
  },
  institutionLogoIntertropicos: {
    height: 52,
    transform: [{ scale: 1.08 }],
  },
  institutionLogoUfpe: {
    height: 50,
    transform: [{ scale: 1.05 }],
  },
  institutionLogoPpgeo: {
    height: 50,
    transform: [{ scale: 1.25 }],
  },
  institutionLogoPaisageo: {
    height: 52,
    transform: [{ scale: 1.1 }],
  },
  footerCaption: {
    lineHeight: 22,
    textAlign: "justify",
  },
});
