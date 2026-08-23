// mobile-app/hooks/use-stable-text-input.ts
import { useCallback, useEffect, useRef, useState } from "react";

// Prevents two react-native-paper/Android TextInput bugs at once:
// - the label's Animated.timing restarting on every keystroke (visible
//   flicker), because Paper's TextInput re-runs that animation whenever its
//   `value` prop changes (node_modules/react-native-paper/src/components/
//   TextInput/TextInput.tsx, effect keyed on `value`, unchanged as of 5.15.3);
// - characters/words getting duplicated when the OS word-suggestion strip
//   inserts text, or when typing fast - a known RN/Android issue with
//   TextInputs whose `value` is reasserted on every keystroke.
//
// Fix: stop feeding `value` back to the TextInput while it's focused - the
// native input is the source of truth while typing, and the field only
// becomes "controlled" again on blur or when `resetKey` changes (e.g.
// switching from adding to editing a different field).
export function useStableTextInput(resetKey: string, initialValue: string) {
  const [value, setValue] = useState(initialValue);
  const [focused, setFocused] = useState(false);
  // react-native-paper doesn't export its TextInput ref-handle type
  // (TextInputHandles), so this is typed loosely - only `.clear()` is used.
  const inputRef = useRef<any>(null);

  useEffect(() => {
    setValue(initialValue);
    // Only resync when the underlying field identity changes, not on every
    // initialValue reference - resetKey is the field's stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const onFocus = useCallback(() => setFocused(true), []);
  const onBlur = useCallback(() => setFocused(false), []);

  // Programmatic clear (e.g. after adding an option) bypasses the
  // controlled `value` prop entirely - while focused, setValue("") alone
  // wouldn't reach the native input until blur.
  const clear = useCallback(() => {
    setValue("");
    inputRef.current?.clear?.();
  }, []);

  return {
    value,
    focused,
    onFocus,
    onBlur,
    clear,
    // React requires `key` to be passed directly in JSX, not through a
    // spread prop object - returned separately so callers do
    // `<TextInput key={resetKey} {...inputProps} />`.
    resetKey,
    inputProps: {
      ref: inputRef,
      defaultValue: initialValue,
      value: focused ? undefined : value,
      onChangeText: setValue,
      onFocus,
      onBlur,
    },
  };
}
