// src/components/ui/InfoBubble.tsx
import React, { useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  TouchableWithoutFeedback,
  Animated,
} from "react-native";
import { Text, IconButton, useTheme, Portal } from "react-native-paper";

interface InfoBubbleProps {
  text: string | null;
  onDismiss: () => void;
}

export default function InfoBubble({ text, onDismiss }: InfoBubbleProps) {
  const theme = useTheme();
  const scale = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (text) {
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          damping: 16,
          stiffness: 220,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 140,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scale.setValue(0.92);
      opacity.setValue(0);
    }
  }, [text, opacity, scale]);

  if (!text) return null;

  return (
    <Portal>
      {/* Dimmed backdrop — tap to dismiss */}
      <TouchableWithoutFeedback onPress={onDismiss}>
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.backdrop, { opacity }]}
        />
      </TouchableWithoutFeedback>

      {/* Centered card */}
      <View style={styles.centeredWrapper} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.outlineVariant,
              shadowColor: theme.colors.shadow,
              transform: [{ scale }],
              opacity,
            },
          ]}
        >
          {/* Icon */}
          <View style={styles.iconRow}>
            <IconButton
              icon="information"
              size={20}
              iconColor={theme.colors.primary}
              style={{ margin: 0 }}
            />
          </View>

          {/* Content */}
          <Text
            variant="bodyMedium"
            style={[styles.bodyText, { color: theme.colors.onSurface }]}
          >
            {text}
          </Text>

          {/* Dismiss */}
          <View style={styles.actionRow}>
            <Text
              variant="labelLarge"
              style={{ color: theme.colors.primary }}
              onPress={onDismiss}
            >
              OK
            </Text>
          </View>
        </Animated.View>
      </View>
    </Portal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  centeredWrapper: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  card: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  iconRow: {
    alignItems: "center",
    marginBottom: 4,
  },
  bodyText: {
    lineHeight: 22,
    textAlign: "justify",
  },
  actionRow: {
    alignItems: "flex-end",
    marginTop: 16,
  },
});
