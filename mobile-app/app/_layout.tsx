// src/app/_layout.tsx
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator } from "react-native";
import { PaperProvider, MD3LightTheme, MD3DarkTheme } from "react-native-paper";
import { ThemeProvider, useTheme } from "../contexts/theme-context";
import { I18nProvider } from "@/contexts/i18n-context";
import { MapDataProvider } from "@/contexts/map-data-context";
import { DialogProvider } from "../hooks/use-dialog";
import { useAppBootstrap } from "@/hooks/use-app-bootstrap";
import { ProtocolKernelProvider } from "@/contexts/protocol-registry-context";
import "react-native-reanimated";

export default function RootLayout() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <MapDataProvider>
          <ProtocolKernelProvider>
            <ThemedApp />
          </ProtocolKernelProvider>
        </MapDataProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

function ThemedApp() {
  const { isDarkMode } = useTheme();
  const { isReady } = useAppBootstrap();

  // Balanced palette derived from the app logo's turquoise edge tone.
  const customLightTheme = {
    ...MD3LightTheme,
    colors: {
      ...MD3LightTheme.colors,
      primary: "#2A8F88",
      primaryContainer: "#C5E3DE",
      secondary: "#287A74",
      secondaryContainer: "#C6DFDB",
      tertiary: "#1F6661",
      outline: "#5A8E88",
      outlineVariant: "#9FC4BF",
      surfaceVariant: "#E7F3F1",
      onPrimary: "#FFFFFF",
      onSecondary: "#ffffff",
      onPrimaryContainer: "#0D2D2A",
      onSecondaryContainer: "#0F2C29",
    },
  };

  const customDarkTheme = {
    ...MD3DarkTheme,
    colors: {
      ...MD3DarkTheme.colors,
      primary: "#7FD1C8",
      primaryContainer: "#1B4F4B",
      secondary: "#96D8D1",
      secondaryContainer: "#245E5A",
      tertiary: "#70B9B2",
      outline: "#6BA8A1",
      outlineVariant: "#3E6F6A",
      surfaceVariant: "#173A37",
      onPrimary: "#041514",
      onSecondary: "#07201E",
      onPrimaryContainer: "#D8F1ED",
      onSecondaryContainer: "#D9F0EC",
    },
  };

  const paperTheme = isDarkMode ? customDarkTheme : customLightTheme;

  // Condition 1: If database is NOT ready, show a Loading Spinner
  // This prevents the UI from trying to fetch data from non-existent tables
  if (!isReady) {
    return (
      <>
        <StatusBar style={isDarkMode ? "light" : "dark"} />
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color="#2A8F88" />
        </View>
      </>
    );
  }

  // Condition 2: Database is ready, render the Main Navigation Stack
  return (
    <PaperProvider theme={paperTheme}>
      <StatusBar style={isDarkMode ? "light" : "dark"} />
      <DialogProvider>
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: paperTheme.colors.surface,
            },
            headerTintColor: paperTheme.colors.onSurface,
            headerTitleStyle: {
              fontWeight: "bold",
            },
            // Without this, the native screen container defaults to a
            // white background. That's normally hidden behind whatever
            // each screen renders, but with edgeToEdgeEnabled (see
            // app.config.js) it can show through in the system bar area
            // at the bottom, most noticeably on screens with enough
            // content to scroll.
            contentStyle: {
              backgroundColor: paperTheme.colors.background,
            },
          }}
        >
          {/* The "(tabs)" folder contains the main UI (Home, Map, etc.).
            We hide the header here because the Tabs layout has its own headers.
          */}
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

          {/* You can add other global screens here later (e.g., Modal, Settings) 
            that exist outside the Tab context 
          */}
        </Stack>
      </DialogProvider>
    </PaperProvider>
  );
}
