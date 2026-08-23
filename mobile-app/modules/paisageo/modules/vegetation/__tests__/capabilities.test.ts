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
import { classifyVegetation } from "@/modules/paisageo/services/vegetation_classifier";
import type { KuchlerClassifyInput } from "@/modules/paisageo/capabilities/vegetation-classifier";
import type { CapabilityHandle } from "@/protocol-kernel/types";
import type { ClassificationResult } from "@/modules/paisageo/services/vegetation_classifier";

// --- Sample data for the golden tests ---

const classifyInput: KuchlerClassifyInput = {
  rawFormula: "B7c,D7i",
  lang: "pt",
};

// --- Tests ---

describe("PAISAGEO capabilities — registration and bus", () => {
  let bus: ReturnType<ReturnType<typeof createProtocolRegistry>["getBus"]>;

  beforeAll(() => {
    const registry = createProtocolRegistry();
    registry.register(paisageoManifest);
    const result = registry.resolve();
    expect(result.ok).toBe(true);
    bus = registry.getBus();
  });

  it("resolve() returns ok: true with the updated manifest", () => {
    const registry = createProtocolRegistry();
    registry.register(paisageoManifest);
    const result = registry.resolve();
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("bus.list() includes the capability", () => {
    const ids = bus.list().map((c) => c.id);
    expect(ids).toContain("kuchler.classifyVegetation");
  });

  describe("kuchler.classifyVegetation", () => {
    let handle: CapabilityHandle<KuchlerClassifyInput, ClassificationResult> | null;

    beforeAll(() => {
      handle = bus.get<KuchlerClassifyInput, ClassificationResult>("kuchler.classifyVegetation");
    });

    it("bus.get returns a non-null handle", () => {
      expect(handle).not.toBeNull();
    });

    it("(golden) invoke via the bus is identical to a direct call to the service", async () => {
      const viaBarramento = await handle!.invoke(classifyInput);
      const direto = classifyVegetation(
        classifyInput.rawFormula,
        classifyInput.lang,
        classifyInput.contextFlags,
      );
      expect(JSON.stringify(viaBarramento)).toBe(JSON.stringify(direto));
    });

    it("classifies 'B7c' as group C1 (dense forest)", async () => {
      const result = await handle!.invoke({ rawFormula: "B7c", lang: "pt" });
      expect(result.groupCode).toBe("C1");
    });
  });
});
