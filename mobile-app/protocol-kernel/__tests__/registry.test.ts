import { createProtocolRegistry } from "../registry";
import {
  mockProtocolA,
  mockProtocolB,
  mockProtocolC,
  mockProtocolD,
} from "./fixtures";

describe("ProtocolRegistry", () => {
  it("resolve() returns ok:true and loadOrder with provider before consumer", () => {
    const registry = createProtocolRegistry();
    registry.register(mockProtocolA); // provides demo.echo
    registry.register(mockProtocolB); // requires demo.echo

    const result = registry.resolve();

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.loadOrder).toContain("mock-a");
    expect(result.loadOrder).toContain("mock-b");
    const indexA = result.loadOrder.indexOf("mock-a");
    const indexB = result.loadOrder.indexOf("mock-b");
    expect(indexA).toBeLessThan(indexB);
  });

  it("resolve() returns ok:false with missing_capability when the capability doesn't exist", () => {
    const registry = createProtocolRegistry();
    registry.register(mockProtocolC); // requires demo.missing

    const result = registry.resolve();

    expect(result.ok).toBe(false);
    const err = result.errors.find((e) => e.type === "missing_capability");
    expect(err).toBeDefined();
    expect(err!.detail).toContain("demo.missing");
    expect(err!.protocolId).toBe("mock-c");
  });

  it("registering two protocols with the same id generates duplicate_protocol", () => {
    const registry = createProtocolRegistry();
    registry.register(mockProtocolA);
    registry.register({ ...mockProtocolA }); // same id

    const result = registry.resolve();

    expect(result.ok).toBe(false);
    const err = result.errors.find((e) => e.type === "duplicate_protocol");
    expect(err).toBeDefined();
    expect(err!.protocolId).toBe("mock-a");
  });

  it("two protocols providing the same capability generates duplicate_capability", () => {
    const registry = createProtocolRegistry();
    registry.register(mockProtocolA); // provides demo.echo
    registry.register(mockProtocolD); // also provides demo.echo

    const result = registry.resolve();

    expect(result.ok).toBe(false);
    const err = result.errors.find((e) => e.type === "duplicate_capability");
    expect(err).toBeDefined();
    expect(err!.detail).toContain("demo.echo");
  });
});
