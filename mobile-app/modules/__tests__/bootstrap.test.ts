// Mocks for the renderers: avoids JSX and React Native imports being loaded
// by ts-jest ("node" environment). customManifest now imports
// modules/registry.ts (for the moduleRef branch), which pulls in the
// Paisageo renderers transitively - the renderers are pure UI, not tested here.
jest.mock("@/modules/paisageo/modules/geoecological-constraints/GeoecologicalConstraintsModuleRenderer", () => ({
  GeoecologicalConstraintsModuleRenderer: () => null,
}));
jest.mock("@/modules/paisageo/modules/vegetation/VegetationModuleRenderer", () => ({
  VegetationModuleRenderer: () => null,
}));
jest.mock("@/modules/paisageo/modules/impacts/ImpactsModuleRenderer", () => ({
  ImpactsModuleRenderer: () => null,
}));
jest.mock("@/modules/paisageo/modules/geoecological-constraints/GeoecologicalConstraintsModuleReadOnlyRenderer", () => ({
  GeoecologicalConstraintsModuleReadOnlyRenderer: () => null,
}));
jest.mock("@/modules/paisageo/modules/vegetation/VegetationModuleReadOnlyRenderer", () => ({
  VegetationModuleReadOnlyRenderer: () => null,
}));
jest.mock("@/modules/paisageo/modules/impacts/ImpactsModuleReadOnlyRenderer", () => ({
  ImpactsModuleReadOnlyRenderer: () => null,
}));

import { createProtocolRegistry } from "@/protocol-kernel/registry";
import { bootstrapProtocols } from "../bootstrap";
import { mockProtocolA } from "@/protocol-kernel/__tests__/fixtures";
import { customManifest } from "@/modules/custom/manifest";
import type { ModuleDescriptor } from "@/protocol-kernel/types";

describe("bootstrapProtocols() — Phase 3: PAISAGEO registered", () => {
  it("resolve().ok === true and loadOrder contains 'paisageo'", () => {
    const registry = bootstrapProtocols();
    const result = registry.resolve();
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.loadOrder).toContain("paisageo");
  });

  it("PAISAGEO manifest accessible with the Geoecological Constraints module", () => {
    const registry = bootstrapProtocols();
    const manifest = registry.getProtocol("paisageo");
    expect(manifest).toBeDefined();
    expect(manifest!.id).toBe("paisageo");
    const geoecoMod = manifest!.modules.find((m: ModuleDescriptor) => m.id === "geoecological_constraints");
    expect(geoecoMod).toBeDefined();
    expect(geoecoMod!.title.pt).toBe("Condicionantes Geoecológicos");
  });
});

describe("bootstrapProtocols() — Phase 4a: customManifest registered", () => {
  it("resolve().ok === true and loadOrder contains 'paisageo' and 'custom'", () => {
    const registry = bootstrapProtocols();
    const result = registry.resolve();
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.loadOrder).toContain("paisageo");
    expect(result.loadOrder).toContain("custom");
  });

  it("customManifest coexists with paisageoManifest without conflict when registered manually", () => {
    const registry = createProtocolRegistry();
    registry.register(mockProtocolA); // provides demo.echo
    registry.register(customManifest); // kind:custom, no capabilities
    const result = registry.resolve();
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("custom manifest accessible via getProtocol", () => {
    const registry = bootstrapProtocols();
    const manifest = registry.getProtocol("custom");
    expect(manifest).toBeDefined();
    expect(manifest!.id).toBe("custom");
    expect(manifest!.kind).toBe("custom");
  });
});
