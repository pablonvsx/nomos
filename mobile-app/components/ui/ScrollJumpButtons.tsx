// mobile-app/components/ui/ScrollJumpButtons.tsx
import React, { useEffect, useRef, useState } from "react";
import { Animated, Keyboard, StyleSheet } from "react-native";
import { IconButton, useTheme } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "@/contexts/i18n-context";

// Same overlay margin/shadow values used by the map's floating buttons
// (components/map/map-overlay-styles.ts), replicated locally so this
// generic UI component doesn't depend on a map-specific module.
const OVERLAY_MARGIN = 16;
const BUTTON_GAP = 8;
const OVERLAY_SHADOW = {
  elevation: 4,
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.25,
  shadowRadius: 4,
} as const;
const BUTTON_BORDER_WIDTH = 1.5;

interface ScrollJumpButtonsProps {
  visible: boolean;
  onScrollToTop: () => void;
  onScrollToBottom: () => void;
}

export default function ScrollJumpButtons({
  visible,
  onScrollToTop,
  onScrollToBottom,
}: ScrollJumpButtonsProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const opacity = useRef(new Animated.Value(0)).current;
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () =>
      setKeyboardVisible(true),
    );
    const hideSub = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardVisible(false),
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const shown = visible && !keyboardVisible;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: shown ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [shown, opacity]);

  return (
    <Animated.View
      pointerEvents={shown ? "box-none" : "none"}
      style={[
        styles.container,
        { right: OVERLAY_MARGIN, bottom: insets.bottom + OVERLAY_MARGIN, opacity },
      ]}
    >
      <IconButton
        icon="chevron-double-up"
        size={22}
        mode="contained"
        containerColor={theme.colors.surface}
        iconColor={theme.colors.primary}
        style={[
          OVERLAY_SHADOW,
          { borderWidth: BUTTON_BORDER_WIDTH, borderColor: theme.colors.primary },
        ]}
        accessibilityLabel={t("survey.scrollToTop")}
        onPress={onScrollToTop}
      />
      <IconButton
        icon="chevron-double-down"
        size={22}
        mode="contained"
        containerColor={theme.colors.surface}
        iconColor={theme.colors.primary}
        style={[
          OVERLAY_SHADOW,
          {
            marginTop: BUTTON_GAP,
            borderWidth: BUTTON_BORDER_WIDTH,
            borderColor: theme.colors.primary,
          },
        ]}
        accessibilityLabel={t("survey.scrollToBottom")}
        onPress={onScrollToBottom}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    alignItems: "center",
  },
});
