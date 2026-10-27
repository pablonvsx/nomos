import { dialogMaxHeight, isScrollable, makeEmailBreakable, orderStackedButtons } from "../dialog-layout";

const btn = (label: string, role?: "primary" | "cancel") => ({ label, role });

describe("orderStackedButtons", () => {
  it("puts the primary action first and cancel last", () => {
    const ordered = orderStackedButtons([
      btn("Cancel", "cancel"),
      btn("Use another account"),
      btn("Continue", "primary"),
    ]);
    expect(ordered.map((b) => b.label)).toEqual(["Continue", "Use another account", "Cancel"]);
  });

  it("keeps the relative order of the remaining actions", () => {
    const ordered = orderStackedButtons([btn("B"), btn("Cancel", "cancel"), btn("A"), btn("P", "primary")]);
    expect(ordered.map((b) => b.label)).toEqual(["P", "B", "A", "Cancel"]);
  });

  it("leaves buttons without roles in their original order", () => {
    const ordered = orderStackedButtons([btn("A"), btn("B")]);
    expect(ordered.map((b) => b.label)).toEqual(["A", "B"]);
  });

  it("does not mutate the input", () => {
    const input = [btn("Cancel", "cancel"), btn("Go", "primary")];
    orderStackedButtons(input);
    expect(input.map((b) => b.label)).toEqual(["Cancel", "Go"]);
  });
});

describe("makeEmailBreakable", () => {
  const ZWSP = "​";

  it("adds break opportunities after @, dot, underscore and hyphen", () => {
    expect(makeEmailBreakable("a.b_c-d@x.com")).toBe(
      `a.${ZWSP}b_${ZWSP}c-${ZWSP}d@${ZWSP}x.${ZWSP}com`,
    );
  });

  it("only inserts invisible characters (stripping them restores the email)", () => {
    const email = "very.long.name_surname@institution.example.edu.br";
    expect(makeEmailBreakable(email).split(ZWSP).join("")).toBe(email);
  });

  it("leaves an empty string alone", () => {
    expect(makeEmailBreakable("")).toBe("");
  });
});

describe("dialogMaxHeight", () => {
  it("is 70% of the window by default", () => {
    expect(dialogMaxHeight(640)).toBe(448);
  });

  it("never exceeds the window minus the dialog's own vertical margins", () => {
    // 360dp-high landscape window: 70% (252) already fits inside 360 - 2 * 44 (272).
    expect(dialogMaxHeight(360)).toBe(252);
    // A ratio near 1 is capped by the margins.
    expect(dialogMaxHeight(360, 0.95)).toBe(272);
  });

  it("accepts another ratio", () => {
    expect(dialogMaxHeight(1000, 0.5)).toBe(500);
  });

  it("never returns a negative height for a degenerate window", () => {
    expect(dialogMaxHeight(50)).toBe(0);
  });
});

describe("isScrollable", () => {
  it("is false when the content fits", () => {
    expect(isScrollable(200, 300)).toBe(false);
    expect(isScrollable(300, 300)).toBe(false);
  });

  it("ignores sub-dp rounding differences", () => {
    expect(isScrollable(300.6, 300)).toBe(false);
  });

  it("is true when the content is taller than the viewport", () => {
    expect(isScrollable(302, 300)).toBe(true);
  });

  it("is false before the viewport has been measured", () => {
    expect(isScrollable(500, 0)).toBe(false);
  });
});
