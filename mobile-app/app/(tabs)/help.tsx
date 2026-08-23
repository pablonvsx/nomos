import React from "react";
import { View, StyleSheet, ScrollView, Linking } from "react-native";
import {
  Text,
  Card,
  List,
  Divider,
  Button,
  useTheme as usePaperTheme,
} from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useI18n } from "@/contexts/i18n-context";
import { BUTTON_RADIUS } from "@/constants/shape";

export default function HelpScreen() {
  const paperTheme = usePaperTheme();
  const { t } = useI18n();
  const router = useRouter();

  const openGitHub = () => {
    Linking.openURL("https://github.com/pablonvsx/nomos");
  };

  const openDrive = () => {
    Linking.openURL(
      "https://drive.google.com/drive/folders/1Ikc18svAf_pBV3j8QSXvILa6XqKRPcRI?usp=sharing"
    );
  };

  return (
    <ScrollView
      style={[
        styles.container,
        { backgroundColor: paperTheme.colors.background },
      ]}
    >
      <View style={styles.content}>
        {/* Header Section */}
        <View style={styles.headerContainer}>
          <MaterialCommunityIcons
            name="help-circle-outline"
            size={64}
            color={paperTheme.colors.primary}
          />
          <Text
            variant="headlineMedium"
            style={[styles.title, { color: paperTheme.colors.onBackground }]}
          >
            {t("help.title")}
          </Text>
          <Text
            variant="bodyMedium"
            style={[styles.subtitle, { color: paperTheme.colors.secondary }]}
          >
            {t("help.welcome")}
          </Text>
        </View>

        {/* Understanding Protocols Intro */}
        <Text
          variant="bodyMedium"
          style={[
            styles.paragraph,
            styles.protocolIntro,
            { color: paperTheme.colors.onSurface },
          ]}
        >
          {t("help.protocolTypesDesc")}
        </Text>

        {/* Paisageo Protocol Card */}
        <Card
          style={[styles.card, { backgroundColor: paperTheme.colors.surface }]}
        >
          <Card.Content>
            <View style={styles.cardHeaderRow}>
              <MaterialCommunityIcons
                name="shield-check"
                size={24}
                color={paperTheme.colors.primary}
              />
              <Text
                variant="titleLarge"
                style={[
                  styles.cardTitleMain,
                  { color: paperTheme.colors.primary },
                ]}
              >
                {t("help.officialProtocol")}
              </Text>
            </View>
            <Text
              variant="bodyMedium"
              style={[styles.paragraph, { color: paperTheme.colors.onSurface }]}
            >
              {t("help.officialProtocolDesc")}
            </Text>
            <View style={styles.protocolCtaColumn}>
              <Button
                mode="contained-tonal"
                icon="school-outline"
                style={[styles.protocolCtaButtonFull, { borderRadius: BUTTON_RADIUS }]}
                onPress={() => router.push("/protocol/tutorials?protocolId=paisageo" as any)}
              >
                {t("tutorials.howToUse")}
              </Button>
            </View>
          </Card.Content>
        </Card>

        {/* Custom Protocol Card */}
        <Card
          style={[styles.card, { backgroundColor: paperTheme.colors.surface }]}
        >
          <Card.Content>
            <View style={styles.cardHeaderRow}>
              <MaterialCommunityIcons
                name="pencil-box-outline"
                size={24}
                color={paperTheme.colors.primary}
              />
              <Text
                variant="titleLarge"
                style={[
                  styles.cardTitleMain,
                  { color: paperTheme.colors.primary },
                ]}
              >
                {t("help.customProtocol")}
              </Text>
            </View>
            <Text
              variant="bodyMedium"
              style={[styles.paragraph, { color: paperTheme.colors.onSurface }]}
            >
              {t("help.customProtocolDesc")}
            </Text>
            <View style={styles.protocolCtaColumn}>
              <Button
                mode="contained-tonal"
                icon="school-outline"
                style={[styles.protocolCtaButtonFull, { borderRadius: BUTTON_RADIUS }]}
                onPress={() => router.push("/protocol/tutorials?protocolId=custom" as any)}
              >
                {t("tutorials.howToUse")}
              </Button>
            </View>
          </Card.Content>
        </Card>

        {/* Key Features */}
        <Card
          style={[styles.card, { backgroundColor: paperTheme.colors.surface }]}
        >
          <Card.Content>
            <View style={styles.cardHeaderRow}>
              <MaterialCommunityIcons
                name="star-circle-outline"
                size={24}
                color={paperTheme.colors.primary}
              />
              <Text
                variant="titleLarge"
                style={[
                  styles.cardTitleMain,
                  { color: paperTheme.colors.primary },
                ]}
              >
                {t("help.keyFeatures")}
              </Text>
            </View>

            <List.Section>
              <List.Item
                title={t("help.offlineMaps")}
                description={t("help.offlineMapsDesc")}
                left={(props) => (
                  <List.Icon
                    {...props}
                    icon="map-legend"
                    color={paperTheme.colors.primary}
                  />
                )}
                titleStyle={styles.featureTitle}
                descriptionStyle={styles.featureDesc}
                descriptionNumberOfLines={0}
              />
              <List.Item
                title={t("help.multiProtocol")}
                description={t("help.multiProtocolDesc")}
                left={(props) => (
                  <List.Icon
                    {...props}
                    icon="puzzle-outline"
                    color={paperTheme.colors.primary}
                  />
                )}
                titleStyle={styles.featureTitle}
                descriptionStyle={styles.featureDesc}
                descriptionNumberOfLines={0}
              />
              <List.Item
                title={t("help.dataExport")}
                description={t("help.dataExportDesc")}
                left={(props) => (
                  <List.Icon
                    {...props}
                    icon="database-export"
                    color={paperTheme.colors.primary}
                  />
                )}
                titleStyle={styles.featureTitle}
                descriptionStyle={styles.featureDesc}
                descriptionNumberOfLines={0}
              />
              <List.Item
                title={t("help.mediaCapture")}
                description={t("help.mediaCaptureDesc")}
                left={(props) => (
                  <List.Icon
                    {...props}
                    icon="play-circle-outline"
                    color={paperTheme.colors.primary}
                  />
                )}
                titleStyle={styles.featureTitle}
                descriptionStyle={styles.featureDesc}
                descriptionNumberOfLines={0}
              />
              <List.Item
                title={t("help.speciesCatalogTitle")}
                description={t("help.speciesCatalogDesc")}
                left={(props) => (
                  <List.Icon
                    {...props}
                    icon="leaf"
                    color={paperTheme.colors.primary}
                  />
                )}
                titleStyle={styles.featureTitle}
                descriptionStyle={styles.featureDesc}
                descriptionNumberOfLines={0}
              />
            </List.Section>
          </Card.Content>
        </Card>

        {/* Step by Step Guide */}
        <Card
          style={[styles.card, { backgroundColor: paperTheme.colors.surface }]}
        >
          <Card.Content>
            <View style={styles.cardHeaderRow}>
              <MaterialCommunityIcons
                name="foot-print"
                size={24}
                color={paperTheme.colors.primary}
              />
              <Text
                variant="titleLarge"
                style={[
                  styles.cardTitleMain,
                  { color: paperTheme.colors.primary },
                ]}
              >
                {t("help.stepByStep")}
              </Text>
            </View>

            <Divider style={styles.divider} />

            <List.Section>
              {/* Step 1 */}
              <View style={styles.stepContainer}>
                <Text
                  variant="titleMedium"
                  style={[styles.stepNumber, { color: paperTheme.colors.primary }]}
                >
                  1.
                </Text>
                <View style={styles.stepContent}>
                  <Text
                    variant="titleMedium"
                    style={[
                      styles.stepTitle,
                      { color: paperTheme.colors.onSurface },
                    ]}
                  >
                    {t("help.step1Title")}
                  </Text>
                  <Text
                    variant="bodyMedium"
                    style={[
                      styles.stepDescription,
                      { color: paperTheme.colors.onSurface },
                    ]}
                  >
                    {t("help.step1Desc")}
                  </Text>
                </View>
              </View>

              <Divider style={styles.stepDivider} />

              {/* Step 2 */}
              <View style={styles.stepContainer}>
                <Text
                  variant="titleMedium"
                  style={[styles.stepNumber, { color: paperTheme.colors.primary }]}
                >
                  2.
                </Text>
                <View style={styles.stepContent}>
                  <Text
                    variant="titleMedium"
                    style={[
                      styles.stepTitle,
                      { color: paperTheme.colors.onSurface },
                    ]}
                  >
                    {t("help.step2Title")}
                  </Text>
                  <Text
                    variant="bodyMedium"
                    style={[
                      styles.stepDescription,
                      { color: paperTheme.colors.onSurface },
                    ]}
                  >
                    {t("help.step2Desc")}
                  </Text>
                </View>
              </View>

              <Divider style={styles.stepDivider} />

              {/* Step 3 */}
              <View style={styles.stepContainer}>
                <Text
                  variant="titleMedium"
                  style={[styles.stepNumber, { color: paperTheme.colors.primary }]}
                >
                  3.
                </Text>
                <View style={styles.stepContent}>
                  <Text
                    variant="titleMedium"
                    style={[
                      styles.stepTitle,
                      { color: paperTheme.colors.onSurface },
                    ]}
                  >
                    {t("help.step3Title")}
                  </Text>
                  <Text
                    variant="bodyMedium"
                    style={[
                      styles.stepDescription,
                      { color: paperTheme.colors.onSurface },
                    ]}
                  >
                    {t("help.step3Desc")}
                  </Text>
                </View>
              </View>

              <Divider style={styles.stepDivider} />

              {/* Step 4 */}
              <View style={styles.stepContainer}>
                <Text
                  variant="titleMedium"
                  style={[styles.stepNumber, { color: paperTheme.colors.primary }]}
                >
                  4.
                </Text>
                <View style={styles.stepContent}>
                  <Text
                    variant="titleMedium"
                    style={[
                      styles.stepTitle,
                      { color: paperTheme.colors.onSurface },
                    ]}
                  >
                    {t("help.step4Title")}
                  </Text>
                  <Text
                    variant="bodyMedium"
                    style={[
                      styles.stepDescription,
                      { color: paperTheme.colors.onSurface },
                    ]}
                  >
                    {t("help.step4Desc")}
                  </Text>
                </View>
              </View>

              <Divider style={styles.stepDivider} />

              {/* Step 5 */}
              <View style={styles.stepContainer}>
                <Text
                  variant="titleMedium"
                  style={[styles.stepNumber, { color: paperTheme.colors.primary }]}
                >
                  5.
                </Text>
                <View style={styles.stepContent}>
                  <Text
                    variant="titleMedium"
                    style={[
                      styles.stepTitle,
                      { color: paperTheme.colors.onSurface },
                    ]}
                  >
                    {t("help.step5Title")}
                  </Text>
                  <Text
                    variant="bodyMedium"
                    style={[
                      styles.stepDescription,
                      { color: paperTheme.colors.onSurface },
                    ]}
                  >
                    {t("help.step5Desc")}
                  </Text>
                </View>
              </View>
            </List.Section>
          </Card.Content>
        </Card>

        {/* Tips Card */}
        <Card
          style={[styles.card, { backgroundColor: paperTheme.colors.surface }]}
        >
          <Card.Content>
            <View style={styles.cardHeaderRow}>
              <MaterialCommunityIcons
                name="lightbulb-on-outline"
                size={24}
                color={paperTheme.colors.primary}
              />
              <Text
                variant="titleLarge"
                style={[
                  styles.cardTitleMain,
                  { color: paperTheme.colors.primary },
                ]}
              >
                {t("help.importantTips")}
              </Text>
            </View>

            <List.Section>
              <List.Item
                title={t("help.backupRegularly")}
                titleNumberOfLines={0}
                left={(props) => (
                  <List.Icon
                    {...props}
                    icon="content-save-outline"
                    color={paperTheme.colors.primary}
                  />
                )}
                titleStyle={styles.tipTitle}
              />
              <List.Item
                title={t("help.useDescriptiveNames")}
                titleNumberOfLines={0}
                left={(props) => (
                  <List.Icon
                    {...props}
                    icon="form-textbox"
                    color={paperTheme.colors.primary}
                  />
                )}
                titleStyle={styles.tipTitle}
              />
              <List.Item
                title={t("help.tipIncludePhotos")}
                titleNumberOfLines={0}
                left={(props) => (
                  <List.Icon
                    {...props}
                    icon="camera-outline"
                    color={paperTheme.colors.primary}
                  />
                )}
                titleStyle={styles.tipTitle}
              />
              <List.Item
                title={t("help.tipRecordAudio")}
                titleNumberOfLines={0}
                left={(props) => (
                  <List.Icon
                    {...props}
                    icon="microphone-outline"
                    color={paperTheme.colors.primary}
                  />
                )}
                titleStyle={styles.tipTitle}
              />
              <List.Item
                title={t("help.tipCheckLocation")}
                titleNumberOfLines={0}
                left={(props) => (
                  <List.Icon
                    {...props}
                    icon="crosshairs-gps"
                    color={paperTheme.colors.primary}
                  />
                )}
                titleStyle={styles.tipTitle}
              />
              <List.Item
                title={t("help.tipReviewBeforeSave")}
                titleNumberOfLines={0}
                left={(props) => (
                  <List.Icon
                    {...props}
                    icon="clipboard-check-outline"
                    color={paperTheme.colors.primary}
                  />
                )}
                titleStyle={styles.tipTitle}
              />
            </List.Section>
          </Card.Content>
        </Card>

        {/* More Help Card with GitHub Link */}
        <Card
          style={[styles.card, { backgroundColor: paperTheme.colors.surface }]}
        >
          <Card.Content>
            <Text
              variant="titleMedium"
              style={[styles.cardTitle, { color: paperTheme.colors.primary }]}
            >
              {t("help.needMoreHelp")}
            </Text>
            <Text
              variant="bodyMedium"
              style={[styles.paragraph, { color: paperTheme.colors.onSurface }]}
            >
              {t("help.needMoreHelpDesc")}
            </Text>
            <Button
              mode="outlined"
              icon="open-in-new"
              onPress={openGitHub}
              style={[styles.githubButton, { borderRadius: BUTTON_RADIUS }]}
            >
              {t("help.visitGitHub")}
            </Button>
            <Button
              mode="outlined"
              icon="google-drive"
              onPress={openDrive}
              style={[styles.githubButton, { borderRadius: BUTTON_RADIUS }]}
            >
              {t("help.visitDrive")}
            </Button>
          </Card.Content>
        </Card>

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
  subtitle: {
    marginTop: 8,
    textAlign: "center",
  },
  card: {
    marginBottom: 20,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 12,
  },
  cardTitleMain: {
    fontWeight: "bold",
    flex: 1,
  },
  cardTitle: {
    fontWeight: "bold",
    marginBottom: 12,
  },
  paragraph: {
    lineHeight: 22,
    marginBottom: 16,
    textAlign: "justify",
  },
  protocolIntro: {
    marginBottom: 4,
  },
  divider: {
    marginVertical: 16,
  },
  protocolCtaColumn: {
    gap: 8,
    marginTop: 16,
  },
  protocolCtaButtonFull: {
    width: "100%",
  },
  stepContainer: {
    flexDirection: "row",
    paddingVertical: 12,
  },
  stepNumber: {
    width: 28,
    marginRight: 12,
    marginTop: 1,
    fontWeight: "bold",
    textAlign: "right",
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontWeight: "bold",
    marginBottom: 4,
  },
  stepDescription: {
    lineHeight: 20,
    textAlign: "justify",
  },
  stepDivider: {
    marginVertical: 8,
  },
  featureTitle: {
    fontWeight: "600",
    fontSize: 15,
  },
  tipTitle: {
    fontWeight: "600",
    fontSize: 15,
    textAlign: "justify",
  },
  featureDesc: {
    lineHeight: 20,
    textAlign: "justify",
  },
  githubButton: {
    marginTop: 4,
  },
});
