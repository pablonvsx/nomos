import { createProtocolRegistry } from "../registry";
import { mockProtocolA } from "./fixtures";

describe("CapabilityBus", () => {
  function buildBus() {
    const registry = createProtocolRegistry();
    registry.register(mockProtocolA);
    registry.resolve();
    return registry.getBus();
  }

  it("get(id).invoke(x) returns x itself for demo.echo", async () => {
    const bus = buildBus();
    const handle = bus.get<unknown, unknown>("demo.echo");
    expect(handle).not.toBeNull();
    const result = await handle!.invoke("hello");
    expect(result).toBe("hello");

    const numResult = await handle!.invoke(42);
    expect(numResult).toBe(42);
  });

  it("get(id) returns null for a nonexistent capability", () => {
    const bus = buildBus();
    const handle = bus.get("nao.existe");
    expect(handle).toBeNull();
  });

  it("has() and list() reflect the bus's correct state", () => {
    const bus = buildBus();

    expect(bus.has("demo.echo")).toBe(true);
    expect(bus.has("outra.cap")).toBe(false);

    const list = bus.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe("demo.echo");
  });
});
