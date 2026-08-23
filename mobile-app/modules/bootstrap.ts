import { createProtocolRegistry } from "@/protocol-kernel/registry";
import type { ProtocolRegistry } from "@/protocol-kernel/types";
import { paisageoManifest } from "@/modules/paisageo/manifest";
import { customManifest } from "@/modules/custom/manifest";

/**
 * Composition root: the one place allowed to know every concrete protocol by
 * name. Lives in modules/, not protocol-kernel/, because the kernel itself
 * must stay agnostic of which protocols exist.
 */
export function bootstrapProtocols(): ProtocolRegistry {
  const registry = createProtocolRegistry();
  registry.register(paisageoManifest);
  registry.register(customManifest);
  const result = registry.resolve();
  if (!result.ok) {
    console.error("[protocol-kernel] resolution failed:", result.errors);
  }
  return registry;
}
