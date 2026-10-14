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
