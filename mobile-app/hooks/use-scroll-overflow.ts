// mobile-app/hooks/use-scroll-overflow.ts
import { useCallback, useRef, useState } from "react";
import { LayoutChangeEvent } from "react-native";

// Small buffer so rounding/scrollbar-inset differences don't flip
// `canScroll` on content that just barely fits the viewport.
const OVERFLOW_BUFFER = 8;

// Tracks whether a ScrollView's content is taller than its visible area,
// using onContentSizeChange/onLayout instead of onScroll — no need to
// track scroll offset, just whether there's anything to scroll to.
export function useScrollOverflow() {
  const [canScroll, setCanScroll] = useState(false);
  const contentHeightRef = useRef(0);
  const layoutHeightRef = useRef(0);

  const evaluate = useCallback(() => {
    setCanScroll(
      contentHeightRef.current > layoutHeightRef.current + OVERFLOW_BUFFER,
    );
  }, []);

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      contentHeightRef.current = height;
      evaluate();
    },
    [evaluate],
  );

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      layoutHeightRef.current = event.nativeEvent.layout.height;
      evaluate();
    },
    [evaluate],
  );

  return { canScroll, onContentSizeChange, onLayout };
}
