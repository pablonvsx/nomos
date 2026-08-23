import type {
  ProtocolRegistry,
  ProtocolManifest,
  ResolvedGraph,
  ResolutionError,
  CapabilityBus,
} from "./types";
import { createCapabilityBus } from "./capability-bus";

export function createProtocolRegistry(): ProtocolRegistry {
  const protocols = new Map<string, ProtocolManifest>();
  const bus = createCapabilityBus();
  const errors: ResolutionError[] = [];

  return {
    register(manifest) {
      if (protocols.has(manifest.id)) {
        errors.push({
          protocolId: manifest.id,
          type: "duplicate_protocol",
          detail: `protocol "${manifest.id}" already registered`,
        });
        return;
      }

      protocols.set(manifest.id, manifest);

      for (const cap of manifest.provides ?? []) {
        if (bus.has(cap.id)) {
          errors.push({
            protocolId: manifest.id,
            type: "duplicate_capability",
            detail: `capability "${cap.id}" already provided by another protocol`,
          });
        } else {
          bus._register(cap);
        }
      }
    },

    resolve(): ResolvedGraph {
      const accumulated: ResolutionError[] = [...errors];

      // Check required capabilities and build the dependency graph
      // protocolId → set of protocol ids it depends on
      const deps = new Map<string, Set<string>>();

      for (const manifest of protocols.values()) {
        const needed = new Set<string>();

        for (const req of manifest.requires ?? []) {
          if (!bus.has(req.id)) {
            if (!req.optional) {
              accumulated.push({
                protocolId: manifest.id,
                type: "missing_capability",
                detail: `requires "${req.id}" (not provided)`,
              });
            }
          } else {
            // Find out which protocol provides this capability
            const provider = findProvider(protocols, req.id);
            if (provider && provider !== manifest.id) {
              needed.add(provider);
            }
          }
        }

        deps.set(manifest.id, needed);
      }

      // Topological sort (Kahn's algorithm)
      const inDegree = new Map<string, number>();
      for (const id of protocols.keys()) {
        inDegree.set(id, 0);
      }
      for (const [, dependsOn] of deps) {
        for (const dep of dependsOn) {
          inDegree.set(dep, (inDegree.get(dep) ?? 0) + 1);
        }
      }

      // Kahn: starts with the nodes nobody depends on (inDegree = 0 in the
      // inverted graph). What we actually want is to load providers BEFORE
      // consumers, so: edge A→B means "A must come before B" (A provides B).
      // inDegree counts how many providers each node still needs to wait for.
      const freeInDegree = new Map<string, number>();
      for (const id of protocols.keys()) {
        freeInDegree.set(id, 0);
      }
      for (const [consumer, providers] of deps) {
        // consumer depends on providers → providers must come first
        // add edge provider → consumer
        freeInDegree.set(consumer, (freeInDegree.get(consumer) ?? 0) + providers.size);
      }

      const queue: string[] = [];
      for (const [id, deg] of freeInDegree) {
        if (deg === 0) queue.push(id);
      }

      const loadOrder: string[] = [];
      while (queue.length > 0) {
        const node = queue.shift()!;
        loadOrder.push(node);

        // For each protocol that depends on `node`, decrement its degree
        for (const [consumer, providers] of deps) {
          if (providers.has(node)) {
            const newDeg = (freeInDegree.get(consumer) ?? 1) - 1;
            freeInDegree.set(consumer, newDeg);
            if (newDeg === 0) queue.push(consumer);
          }
        }
      }

      if (loadOrder.length < protocols.size) {
        // There's a cycle: unreached protocols
        for (const id of protocols.keys()) {
          if (!loadOrder.includes(id)) {
            accumulated.push({
              protocolId: id,
              type: "missing_capability",
              detail: `dependency cycle detected involving "${id}"`,
            });
          }
        }
      }

      return {
        loadOrder,
        ok: accumulated.length === 0,
        errors: accumulated,
      };
    },

    getProtocol(id) {
      return protocols.get(id);
    },

    listProtocols() {
      return Array.from(protocols.values());
    },

    getBus(): CapabilityBus {
      return bus;
    },
  };
}

function findProvider(
  protocols: Map<string, ProtocolManifest>,
  capabilityId: string
): string | null {
  for (const [id, manifest] of protocols) {
    if (manifest.provides?.some((c) => c.id === capabilityId)) {
      return id;
    }
  }
  return null;
}
