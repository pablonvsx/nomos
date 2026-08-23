// Mock the renderers: avoids JSX and React Native imports being loaded
// by ts-jest ("node" environment). The renderers are pure UI, not tested here.
jest.mock("@/modules/paisageo/modules/geoecological-constraints/GeoecologicalConstraintsModuleRenderer", () => ({
  GeoecologicalConstraintsModuleRenderer: () => null,
}));
jest.mock("@/modules/paisageo/modules/vegetation/VegetationModuleRenderer", () => ({
  VegetationModuleRenderer: () => null,
}));
jest.mock("@/modules/paisageo/modules/impacts/ImpactsModuleRenderer", () => ({
  ImpactsModuleRenderer: () => null,
}));

import { createProtocolRegistry } from "@/protocol-kernel/registry";
import { paisageoManifest } from "@/modules/paisageo/manifest";
import {
  generateLandscapeName,
  type LandscapeDataInput,
} from "@/modules/paisageo/services/landscape-naming";
import type { LandscapeGenerateNameInput } from "@/modules/paisageo/capabilities/landscape-naming";
import type { CapabilityHandle } from "@/protocol-kernel/types";

// --- Representative sample ---

const sampleData: LandscapeDataInput = {
  veg_physiognomy_name: "Floresta Tropical Úmida",
  geomorphology_type: JSON.stringify(["colina"]),
  environmental_impacts: JSON.stringify({ desmatamento: 3 }),
};

const sampleInput: LandscapeGenerateNameInput = {
  data: sampleData,
  lang: "pt",
};

// --- Tests ---

describe("landscape.generateName — registration and bus", () => {
  let bus: ReturnType<ReturnType<typeof createProtocolRegistry>["getBus"]>;

  beforeAll(() => {
    const registry = createProtocolRegistry();
    registry.register(paisageoManifest);
    const result = registry.resolve();
    expect(result.ok).toBe(true);
    bus = registry.getBus();
  });

  it("resolve() returns ok: true; requires remains []", () => {
    const registry = createProtocolRegistry();
    registry.register(paisageoManifest);
    const result = registry.resolve();
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(paisageoManifest.requires ?? []).toHaveLength(0);
  });

  it("bus.list() includes both PAISAGEO capabilities", () => {
    const ids = bus.list().map((c) => c.id);
    expect(ids).toContain("kuchler.classifyVegetation");
    expect(ids).toContain("landscape.generateName");
  });

  describe("landscape.generateName", () => {
    let handle: CapabilityHandle<LandscapeGenerateNameInput, string> | null;

    beforeAll(() => {
      handle = bus.get<LandscapeGenerateNameInput, string>("landscape.generateName");
    });

    it("bus.get returns a non-null handle", () => {
      expect(handle).not.toBeNull();
    });

    it("(golden) invoke via the bus is identical to a direct call to the service", async () => {
      const viaBarramento = await handle!.invoke(sampleInput);
      const direto = generateLandscapeName(sampleData, "pt");
      expect(viaBarramento).toBe(direto);
    });

    it("(golden) language 'en' produces an identical result", async () => {
      const input: LandscapeGenerateNameInput = { data: sampleData, lang: "en" };
      const viaBarramento = await handle!.invoke(input);
      const direto = generateLandscapeName(sampleData, "en");
      expect(viaBarramento).toBe(direto);
    });

    it("omitted lang defaults to 'pt'", async () => {
      const semLang: LandscapeGenerateNameInput = { data: sampleData };
      const viaBarramento = await handle!.invoke(semLang);
      const direto = generateLandscapeName(sampleData, undefined);
      expect(viaBarramento).toBe(direto);
    });
  });
});
