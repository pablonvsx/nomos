// mobile-app/components/ui/CardHeaderIconButton.tsx
import React from "react";
import { IconButton, useTheme } from "react-native-paper";
import { BUTTON_RADIUS } from "@/constants/shape";

interface CardHeaderIconButtonProps {
  icon: string;
  onPress: () => void;
  disabled?: boolean;
  size?: number;
  accessibilityLabel?: string;
}

// The icon-only "rounded rectangle" action button placed at card-header
// level, alongside the card title (map, tutorial, edit, add, etc.).
export function CardHeaderIconButton({ icon, onPress, disabled, size = 24, accessibilityLabel }: CardHeaderIconButtonProps) {
  const theme = useTheme();
  return (
    <IconButton
      icon={icon}
      size={size}
      mode="contained-tonal"
      containerColor={theme.colors.secondaryContainer}
      iconColor={theme.colors.onSecondaryContainer}
      style={{ borderRadius: BUTTON_RADIUS, marginRight: -1 }}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
