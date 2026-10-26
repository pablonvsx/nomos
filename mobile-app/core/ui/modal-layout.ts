/**
 * Pure metrics behind components/ui/ModalActions.tsx, so the footer's geometry
 * (equal heights, equal gaps) is testable under plain Node: the project's Jest
 * setup does not render components.
 */

import {
  MODAL_BUTTON_BORDER,
  MODAL_BUTTON_HEIGHT,
  MODAL_FOOTER_GAP_ABOVE,
  MODAL_FOOTER_GAP_BELOW,
  MODAL_STACKED_GAP,
} from "@/constants/modal-layout";

export type FooterButtonVariant = "outline" | "solid";

export interface ButtonMetrics {
  /** Height of the button as drawn, border included. */
  outerHeight: number;
  borderWidth: number;
  /** Height to give the Paper Button's content so that border + content = the outer height. */
  contentHeight: number;
}

/** Both variants have the same border width and the same outer height; only the border's color differs. */
export function buttonMetrics(_variant: FooterButtonVariant): ButtonMetrics {
  return {
    outerHeight: MODAL_BUTTON_HEIGHT,
    borderWidth: MODAL_BUTTON_BORDER,
    contentHeight: MODAL_BUTTON_HEIGHT - 2 * MODAL_BUTTON_BORDER,
  };
}

export interface FooterMetrics {
  gapAbove: number;
  gapBelow: number;
  /** Total height of a one-row footer. */
  height: number;
  /** Space between the stacked buttons. */
  stackedGap: number;
}

export function footerMetrics(): FooterMetrics {
  return {
    gapAbove: MODAL_FOOTER_GAP_ABOVE,
    gapBelow: MODAL_FOOTER_GAP_BELOW,
    height: MODAL_FOOTER_GAP_ABOVE + MODAL_BUTTON_HEIGHT + MODAL_FOOTER_GAP_BELOW,
    stackedGap: MODAL_STACKED_GAP,
  };
}

/** Height of the stacked footer for `count` buttons. */
export function stackedFooterHeight(count: number): number {
  const m = footerMetrics();
  return m.gapAbove + count * MODAL_BUTTON_HEIGHT + Math.max(0, count - 1) * m.stackedGap + m.gapBelow;
}
