/**
 * Pure layout rules for hooks/use-dialog.tsx, kept free of react-native so
 * they run under the node jest setup.
 */

export type DialogButtonRole = "primary" | "cancel";

/**
 * Order of the actions in a stacked dialog (one per row, full width): the
 * primary action on top, cancel at the bottom, the rest in between in their
 * original order.
 */
export function orderStackedButtons<B extends { role?: DialogButtonRole }>(buttons: B[]): B[] {
  const primary = buttons.filter((b) => b.role === "primary");
  const middle = buttons.filter((b) => b.role !== "primary" && b.role !== "cancel");
  const cancel = buttons.filter((b) => b.role === "cancel");
  return [...primary, ...middle, ...cancel];
}

const ZERO_WIDTH_SPACE = "​";

/**
 * An email is one unbreakable token, so a long one overflows or breaks
 * mid-word with ugly gaps in justified text. A zero-width space after the
 * characters people read as separators gives the line a natural break point
 * without changing what is displayed.
 */
export function makeEmailBreakable(email: string): string {
  return email.replace(/[@._-]/g, (separator) => `${separator}${ZERO_WIDTH_SPACE}`);
}

/** Share of the window a list dialog may take before its content scrolls. */
export const DIALOG_MAX_HEIGHT_RATIO = 0.7;
/** Paper's Dialog.marginVertical on Android: the dialog never gets this much of the window top and bottom. */
const DIALOG_WINDOW_MARGIN_V = 44;
/** Differences below this (in dp) are layout rounding, not real overflow. */
const SCROLL_TOLERANCE = 1;

/**
 * Absolute max height (dp) for a dialog that holds a scrolling list. A number,
 * not a percentage: with `maxHeight: "80%"` the scroll area (flexGrow: 1 in
 * Paper) reserved more height than its content and left an empty band above
 * the footer. The cap also stays inside Paper's own vertical margins, so it
 * holds in landscape.
 */
export function dialogMaxHeight(windowHeight: number, ratio: number = DIALOG_MAX_HEIGHT_RATIO): number {
  return Math.max(0, Math.round(Math.min(windowHeight * ratio, windowHeight - 2 * DIALOG_WINDOW_MARGIN_V)));
}

/** True when a ScrollView's content is taller than its visible area (viewport 0 = not measured yet). */
export function isScrollable(contentHeight: number, viewportHeight: number): boolean {
  return viewportHeight > 0 && contentHeight - viewportHeight > SCROLL_TOLERANCE;
}
