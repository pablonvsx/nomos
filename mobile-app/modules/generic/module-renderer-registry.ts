import type { ComponentType } from "react";
import type { ModuleRendererBinding, ModuleRendererProps } from "@/protocol-kernel/types";

export interface ModuleRendererRegistry {
  register(binding: ModuleRendererBinding): void;
  get(moduleId: string): ComponentType<ModuleRendererProps> | undefined;
}

export function createModuleRendererRegistry(): ModuleRendererRegistry {
  const store = new Map<string, ComponentType<ModuleRendererProps>>();
  return {
    register({ moduleId, Renderer }) {
      store.set(moduleId, Renderer);
    },
    get(moduleId) {
      return store.get(moduleId);
    },
  };
}
