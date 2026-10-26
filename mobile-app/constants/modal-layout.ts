// mobile-app/constants/modal-layout.ts
//
// The one place that defines the vertical rhythm of every modal and dialog:
// padding, the gap between title and body, and the footer. The footer
// (components/ui/ModalActions.tsx) OWNS the space above and below its buttons;
// whatever sits above it (dialog body, scroll area, a modal's content) ends
// with no bottom padding of its own, so the gaps never add up. Values in dp.

/** Left and right padding of a modal's header and content. */
export const MODAL_PADDING_H = 24;
/** Space above the title. */
export const MODAL_PADDING_TOP = 24;
/** Space between the title and the body. */
export const MODAL_TITLE_GAP = 16;

/** Space between the end of the content and the top of the footer buttons. */
export const MODAL_FOOTER_GAP_ABOVE = 24;
/** Space between the bottom of the footer buttons and the modal's bottom edge: the same as above, so the buttons sit centered in the footer band. */
export const MODAL_FOOTER_GAP_BELOW = 24;

/** Space above buttons that sit INSIDE a modal's content (a pair of actions per list row), not in its footer. */
export const MODAL_INLINE_ACTIONS_GAP = 12;

/** Outer height of every footer button, outlined or solid. */
export const MODAL_BUTTON_HEIGHT = 48;
/** Border of a footer button. Both variants carry it (the solid one transparent), so the outline never makes a button taller. */
export const MODAL_BUTTON_BORDER = 1;
/** Space between buttons in the stacked footer. */
export const MODAL_STACKED_GAP = 12;

/**
 * Paper's Dialog.ScrollArea draws a 1dp line (theme surfaceVariant, greenish in
 * this app) on its top and bottom. Dialogs here have no frame lines: the
 * spacing alone separates title, content and footer.
 */
export const MODAL_SCROLL_AREA_STYLE = {
  borderTopWidth: 0,
  borderBottomWidth: 0,
} as const;
