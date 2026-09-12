import { Pressable, type PressableProps } from "react-native";
import * as Haptics from "expo-haptics";

// expo-router (since SDK 56) vendors its own PlatformPressable-based
// tabBarButton slot and hard-errors at bundle time if
// @react-navigation/bottom-tabs or @react-navigation/elements are imported
// alongside it (https://docs.expo.dev/router/migrate/sdk-55-to-56/) - this
// uses a plain react-native Pressable instead of react-navigation's
// PlatformPressable, losing only the Android ripple-color/hover-effect
// extras that component added, which this app never customized anyway.
export function HapticTab(props: PressableProps) {
  return (
    <Pressable
      {...props}
      onPressIn={(ev) => {
        if (process.env.EXPO_OS === "ios") {
          // Add a soft haptic feedback when pressing down on the tabs.
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        props.onPressIn?.(ev);
      }}
    />
  );
}
