import { makeEmailBreakable, orderStackedButtons } from "../dialog-layout";

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
