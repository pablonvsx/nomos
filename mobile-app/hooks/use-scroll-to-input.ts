// mobile-app/hooks/use-scroll-to-input.ts
import { useCallback, useEffect, useRef } from "react";
import { Keyboard, ScrollView } from "react-native";

// Scrolls a focused TextInput above the keyboard inside a ScrollView.
// Uses ScrollResponder's native handle-to-keyboard API instead of a new
// dependency (react-native-keyboard-aware-scroll-view etc. aren't
// installed and CLAUDE.md asks to avoid new libs without a clear need).
// Works even inside react-native-paper's Dialog/Portal, where a
// KeyboardAvoidingView on the screen has no effect because the Dialog is
// teleported outside the screen's render tree.
//
// `event` is typed `any`: react-native-paper's TextInput declares
// `onFocus?: (args: any) => void`, and its `event.target` (a TextInput
// native handle) is exactly what `scrollResponderScrollNativeHandleToKeyboard`
// expects - no findNodeHandle conversion needed.
export function useScrollToInput(extraOffset = 80) {
  const scrollViewRef = useRef<ScrollView>(null);
  const pendingNodeRef = useRef<any>(null);

  const scrollToNode = useCallback(
    (node: any) => {
      scrollViewRef.current
        ?.getScrollResponder()
        ?.scrollResponderScrollNativeHandleToKeyboard(node, extraOffset, true);
    },
    [extraOffset],
  );

  // When the focused field is freshly mounted (e.g. "Min"/"Max"/option list,
  // which only appear after choosing the field's type), focus fires while
  // the keyboard is still closed/animating - the rAF below runs too early
  // to know the keyboard's height, so the field ends up covered. This
  // listener redoes the scroll as soon as the keyboard finishes appearing.
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      if (pendingNodeRef.current) scrollToNode(pendingNodeRef.current);
    });
    return () => sub.remove();
  }, [scrollToNode]);

  const handleFocus = useCallback(
    (event: any) => {
      const node = event?.target;
      if (!node) return;
      pendingNodeRef.current = node;
      // Immediate attempt: covers the common case of the keyboard already
      // being open (focus jumping from one field to another).
      requestAnimationFrame(() => scrollToNode(node));
    },
    [scrollToNode],
  );

  return { scrollViewRef, handleFocus };
}
