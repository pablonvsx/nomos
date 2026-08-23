import React, { createContext, useContext } from "react";
import type { ProtocolRegistry, CapabilityBus } from "@/protocol-kernel/types";
import type { ModuleRendererRegistry } from "@/modules/generic/module-renderer-registry";
import type { ModuleReadOnlyRendererRegistry } from "@/modules/generic/module-read-only-renderer-registry";
import { bootstrapProtocols } from "@/modules/bootstrap";
import { createModuleRendererRegistry } from "@/modules/generic/module-renderer-registry";
import { createModuleReadOnlyRendererRegistry } from "@/modules/generic/module-read-only-renderer-registry";
import { paisageoRendererBindings } from "@/modules/paisageo/renderers";
import { paisageoReadOnlyRendererBindings } from "@/modules/paisageo/read-only-renderers";
import type { Project } from "@/types/database";

// Singletons — initialized once on module load
const globalRegistry = bootstrapProtocols();
const globalBus = globalRegistry.getBus();
const globalRendererRegistry = createModuleRendererRegistry();
for (const b of paisageoRendererBindings) {
  globalRendererRegistry.register(b);
}
// Read-only variant used by the point-details screen - registered
// separately from globalRendererRegistry so the interactive collection
// renderers (and the ~10 files they depend on) stay completely untouched.
const globalReadOnlyRendererRegistry = createModuleReadOnlyRendererRegistry();
for (const b of paisageoReadOnlyRendererBindings) {
  globalReadOnlyRendererRegistry.register(b);
}

const RegistryCtx = createContext<ProtocolRegistry>(globalRegistry);
const RendererCtx = createContext<ModuleRendererRegistry>(globalRendererRegistry);
const ReadOnlyRendererCtx = createContext<ModuleReadOnlyRendererRegistry>(globalReadOnlyRendererRegistry);
const BusCtx = createContext<CapabilityBus>(globalBus);

export function ProtocolKernelProvider({ children }: { children: React.ReactNode }) {
  return (
    <RegistryCtx.Provider value={globalRegistry}>
      <RendererCtx.Provider value={globalRendererRegistry}>
        <ReadOnlyRendererCtx.Provider value={globalReadOnlyRendererRegistry}>
          <BusCtx.Provider value={globalBus}>
            {children}
          </BusCtx.Provider>
        </ReadOnlyRendererCtx.Provider>
      </RendererCtx.Provider>
    </RegistryCtx.Provider>
  );
}

export const useProtocolRegistry = () => useContext(RegistryCtx);
export const useRendererRegistry = () => useContext(RendererCtx);
export const useReadOnlyRendererRegistry = () => useContext(ReadOnlyRendererCtx);
export const useCapabilityBus = () => useContext(BusCtx);

/** Mapeia um projeto do banco para o ID de manifesto correspondente no kernel. */
export function resolveManifestId(project: Project): string {
  if (project.protocol_source === "custom") return "custom";
  return project.protocol_id;
}
