import {
  MODAL_BUTTON_HEIGHT,
  MODAL_FOOTER_GAP_ABOVE,
  MODAL_FOOTER_GAP_BELOW,
  MODAL_PADDING_H,
  MODAL_PADDING_TOP,
  MODAL_SCROLL_AREA_STYLE,
  MODAL_STACKED_GAP,
  MODAL_TITLE_GAP,
} from "@/constants/modal-layout";
import { buttonMetrics, footerMetrics, stackedFooterHeight } from "../modal-layout";

describe("modal layout tokens", () => {
  it("are the agreed values, in one place", () => {
    expect(MODAL_PADDING_H).toBe(24);
    expect(MODAL_PADDING_TOP).toBe(24);
    expect(MODAL_TITLE_GAP).toBe(16);
    expect(MODAL_BUTTON_HEIGHT).toBe(48);
    expect(MODAL_STACKED_GAP).toBe(12);
  });

  it("the space above the footer buttons equals the space below, so they sit centered in the band", () => {
    expect(MODAL_FOOTER_GAP_ABOVE).toBe(MODAL_FOOTER_GAP_BELOW);
    const m = footerMetrics();
    expect(m.gapAbove).toBe(m.gapBelow);
  });

  it("the scroll area has no frame lines", () => {
    expect(MODAL_SCROLL_AREA_STYLE).toEqual({ borderTopWidth: 0, borderBottomWidth: 0 });
  });
});

describe("buttonMetrics", () => {
  it("gives the outlined and the solid button the same outer height, border included", () => {
    const outline = buttonMetrics("outline");
    const solid = buttonMetrics("solid");
    expect(outline.outerHeight).toBe(solid.outerHeight);
    expect(outline.outerHeight).toBe(48);
  });

  it("makes content + both borders add up to the outer height, so an outline never makes a button taller", () => {
    for (const variant of ["outline", "solid"] as const) {
      const m = buttonMetrics(variant);
      expect(m.contentHeight + 2 * m.borderWidth).toBe(m.outerHeight);
    }
  });

  it("gives both variants the same border width (the solid one draws it transparent)", () => {
    expect(buttonMetrics("solid").borderWidth).toBe(buttonMetrics("outline").borderWidth);
  });
});

describe("footerMetrics / stackedFooterHeight", () => {
  it("a one-row footer is gap + button + gap", () => {
    expect(footerMetrics().height).toBe(24 + 48 + 24);
  });

  it("the stacked footer uses the same gaps above and below, 12 between buttons and the same button height", () => {
    expect(stackedFooterHeight(1)).toBe(footerMetrics().height);
    expect(stackedFooterHeight(3)).toBe(24 + 3 * 48 + 2 * 12 + 24);
    expect(footerMetrics().stackedGap).toBe(12);
  });
});
