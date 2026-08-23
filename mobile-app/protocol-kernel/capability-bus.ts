import type {
  CapabilityBus,
  CapabilityDeclaration,
  CapabilityHandle,
} from "./types";

/** Internal bus that exposes _register to the registry. */
export interface InternalCapabilityBus extends CapabilityBus {
  _register(decl: CapabilityDeclaration): void;
}

export function createCapabilityBus(): InternalCapabilityBus {
  const store = new Map<string, CapabilityDeclaration>();

  return {
    _register(decl) {
      store.set(decl.id, decl);
    },

    get<I, O>(id: string, _versionRange?: string): CapabilityHandle<I, O> | null {
      const decl = store.get(id) as CapabilityDeclaration<I, O> | undefined;
      if (!decl) return null;
      return {
        id: decl.id,
        version: decl.version,
        invoke: (input: I) => decl.implementation(input),
      };
    },

    has(id) {
      return store.has(id);
    },

    list() {
      return Array.from(store.values());
    },
  };
}
