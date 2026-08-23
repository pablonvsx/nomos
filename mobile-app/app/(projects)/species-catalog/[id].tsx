import { useLocalSearchParams, Stack } from "expo-router";
import { View } from "react-native";
import { useTheme } from "react-native-paper";
import SpeciesManagementModal from "@/components/species/SpeciesManagementModal";
import { useI18n } from "@/contexts/i18n-context";
import { useBottomContentPadding } from "@/hooks/use-bottom-content-padding";

export default function SpeciesCatalogScreen() {
  const { id, lat, lng } = useLocalSearchParams<{
    id: string;
    lat?: string;
    lng?: string;
  }>();
  const bottomPadding = useBottomContentPadding();
  const theme = useTheme();
  const { t } = useI18n();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingBottom: bottomPadding }}>
      <Stack.Screen options={{ title: t("species.speciesCatalog") }} />
      <SpeciesManagementModal
        mode="screen"
        visible={true}
        projectId={parseInt(id)}
        latitude={lat ? parseFloat(lat) : undefined}
        longitude={lng ? parseFloat(lng) : undefined}
        onDismiss={() => {}}
      />
    </View>
  );
}
