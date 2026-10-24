// mobile-app/constants/shape.ts
//
// Shared shape tokens for the "rounded-rectangle" button look used across
// the app's Button/IconButton/SegmentedButtons (as opposed to react-native-
// paper's default pill shape). Targeted per-component styling, not a
// global theme.roundness change - keeps Card/TextInput/Dialog/Chip/Menu
// unaffected.

export const BUTTON_RADIUS = 8;

// Modals and dialogs share the buttons' corner radius. Paper's Dialog derives
// its radius from `7 * theme.roundness` (28 in MD3) and the custom Modals
// hardcoded their own, so each one applies this explicitly instead of
// changing the global theme.roundness.
export const MODAL_RADIUS = BUTTON_RADIUS;
export const MODAL_SHAPE_STYLE = { borderRadius: MODAL_RADIUS };

// react-native-paper's Button/SegmentedButtons compute borderRadius as
// `5 * theme.roundness` in MD3. Passing this as a scoped `theme` prop to a
// single SegmentedButtons instance reproduces BUTTON_RADIUS on both its
// container and its internal ripple (a plain `style.borderRadius` override
// only reshapes the container, leaving the ripple radius mismatched).
export const SEGMENTED_BUTTONS_SHAPE_THEME = { roundness: BUTTON_RADIUS / 5 };
