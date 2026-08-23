// services/export.ts also imports core/export/file-writer.ts (native Expo
// packages) and db/queries/species.ts (expo-sqlite), which jest
// (ts-jest, "node" environment) cannot transform. Same stub used in
// modules/custom/__tests__/export.test.ts, just to allow importing the
// module under test — impactMagnitudeDescColumns is pure logic, it doesn't
// use any of these dependencies.
jest.mock("expo-file-system", () => ({}));
jest.mock("expo-sharing", () => ({}));
jest.mock("react-native-zip-archive", () => ({}));
jest.mock("@/db/queries/species", () => ({ getSpeciesByPoint: jest.fn() }));

import { impactMagnitudeDescColumns } from "../export";
import type { PointEnvelope } from "@/protocol-kernel/types";

function makePoint(
  id: string,
  impacts: Array<{ type: string; magnitude: string }>,
): PointEnvelope {
  return {
    id,
    projectId: "project-1",
    protocolId: "paisageo",
    pointNumber: 1,
    lat: 0,
    lon: 0,
    modules: { impacts: { impacts: impacts.map((i) => ({ ...i, details: "" })) } },
  };
}

describe("impactMagnitudeDescColumns", () => {
  it("generates no columns when no point has impacts", () => {
    const points = [makePoint("1", []), makePoint("2", [])];
    const { keys, headers } = impactMagnitudeDescColumns(points, "pt");
    expect(keys).toHaveLength(0);
    expect(headers).toHaveLength(0);
  });

  it("generates one column per slot, up to the maximum cardinality among the points", () => {
    const points = [
      makePoint("1", [{ type: "pollution", magnitude: "occasional" }]),
      makePoint("2", [
        { type: "pollution", magnitude: "critical" },
        { type: "erosion", magnitude: "common" },
      ]),
    ];
    const { keys, headers } = impactMagnitudeDescColumns(points, "pt");
    expect(keys).toEqual(["impact_1_magnitude_desc", "impact_2_magnitude_desc"]);
    expect(headers).toEqual(["Descrição da Magnitude 1", "Descrição da Magnitude 2"]);
  });

  it("resolves the description by type+magnitude and fills empty when the impact is missing in the slot", () => {
    const points = [
      makePoint("1", [{ type: "pollution", magnitude: "occasional" }]),
      makePoint("2", [
        { type: "pollution", magnitude: "critical" },
        { type: "erosion", magnitude: "common" },
      ]),
    ];
    const { rowFor } = impactMagnitudeDescColumns(points, "pt");

    const row1 = rowFor(points[0]);
    expect(row1[0]).toBe(
      "Resíduos dispersos pontualmente; impacto localizado e reversível a curto prazo.",
    );
    expect(row1[1]).toBe(""); // slot 2 absent in point 1

    const row2 = rowFor(points[1]);
    expect(row2[0]).toBe(
      "Passivo ambiental grave; solo ou água visivelmente comprometidos — recuperação improvável sem intervenção.",
    );
    expect(row2[1]).toBe(
      "Ravinas ativas com sulcos 10–50 cm; perda expressiva do horizonte A; assoreamento de drenagens.",
    );
  });

  it("localizes header and content for another language (en)", () => {
    const points = [makePoint("1", [{ type: "pollution", magnitude: "occasional" }])];
    const { headers, rowFor } = impactMagnitudeDescColumns(points, "en");
    expect(headers).toEqual(["Magnitude Description 1"]);
    expect(rowFor(points[0])[0]).toBe(
      "Scattered waste; localized and reversible impact in the short term.",
    );
  });
});
