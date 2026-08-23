import { cardinalToDegrees, degreesToCardinal, formatAzimuthDisplay } from "../azimuth";

describe("degreesToCardinal", () => {
  it("converts the six test values from the spec document", () => {
    expect(degreesToCardinal(0)).toBe("N");
    expect(degreesToCardinal(45)).toBe("NE");
    expect(degreesToCardinal(90)).toBe("E");
    expect(degreesToCardinal(180)).toBe("S");
    expect(degreesToCardinal(270)).toBe("W");
    expect(degreesToCardinal(315)).toBe("NW");
  });

  it("covers the remaining intercardinal points", () => {
    expect(degreesToCardinal(135)).toBe("SE");
    expect(degreesToCardinal(225)).toBe("SW");
  });

  it("N covers the range around 0°/360° (337.5°-360° and 0°-22.5°)", () => {
    expect(degreesToCardinal(337.5)).toBe("N");
    expect(degreesToCardinal(359)).toBe("N");
    expect(degreesToCardinal(360)).toBe("N");
    expect(degreesToCardinal(22)).toBe("N");
  });
});

describe("cardinalToDegrees", () => {
  it("converts each cardinal point to its standard degree (multiples of 45°)", () => {
    expect(cardinalToDegrees("N")).toBe(0);
    expect(cardinalToDegrees("NE")).toBe(45);
    expect(cardinalToDegrees("E")).toBe(90);
    expect(cardinalToDegrees("SE")).toBe(135);
    expect(cardinalToDegrees("S")).toBe(180);
    expect(cardinalToDegrees("SW")).toBe(225);
    expect(cardinalToDegrees("W")).toBe(270);
    expect(cardinalToDegrees("NW")).toBe(315);
  });

  it("is the inverse of degreesToCardinal for the standard degrees", () => {
    expect(degreesToCardinal(cardinalToDegrees("SE"))).toBe("SE");
  });
});

describe("formatAzimuthDisplay", () => {
  const fakeT = (key: string) => key;

  it("assembles the text with degree, name translation key, and abbreviation", () => {
    expect(formatAzimuthDisplay(180, fakeT)).toBe(
      "180° - survey.azimuthCardinalPoints.S (S)",
    );
  });

  it("uses the nearest cardinal point when the degree isn't a multiple of 45°", () => {
    expect(formatAzimuthDisplay(100, fakeT)).toBe(
      "100° - survey.azimuthCardinalPoints.E (E)",
    );
  });
});
