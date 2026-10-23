// mobile-app/constants/modal-title.ts
//
// Single title style for every modal/dialog in the app (Paper Dialog.Title and
// the custom headers of full Modals), so titles read the same size everywhere.
// Color and alignment stay with each call site.

export const MODAL_TITLE_FONT_SIZE = 20;

export const MODAL_TITLE_STYLE = {
  fontSize: MODAL_TITLE_FONT_SIZE,
  lineHeight: 28,
  fontWeight: "600" as const,
  letterSpacing: 0,
};
