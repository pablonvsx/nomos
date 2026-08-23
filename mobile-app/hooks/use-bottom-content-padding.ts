import { useSafeAreaInsets } from "react-native-safe-area-context";

const MIN_BOTTOM_PADDING = 32;
const BOTTOM_INSET_BUFFER = 16;

// Baseline safe bottom padding used across the app so content/buttons never
// sit under Android's edge-to-edge nav bar/gesture pill. `extra` lets a
// screen add clearance for its own overlapping UI (e.g. a FAB or menu
// stacked above the nav bar), while still guaranteeing the safe-area floor.
export function useBottomContentPadding(extra: number = 0): number {
  const insets = useSafeAreaInsets();
  return Math.max(MIN_BOTTOM_PADDING, insets.bottom + BOTTOM_INSET_BUFFER) + extra;
}
