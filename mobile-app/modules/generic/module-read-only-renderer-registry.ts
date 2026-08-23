import type { ComponentType } from "react";
import type { LanguageCode } from "@/protocol-kernel/types";

export interface ModuleReadOnlyRendererProps {
  value: unknown;
  language: LanguageCode;
}

export interface ModuleReadOnlyRendererBinding {
  moduleId: string;
  Renderer: ComponentType<ModuleReadOnlyRendererProps>;
}

export interface ModuleReadOnlyRendererRegistry {
  register(binding: ModuleReadOnlyRendererBinding): void;
  get(moduleId: string): ComponentType<ModuleReadOnlyRendererProps> | undefined;
}

export function createModuleReadOnlyRendererRegistry(): ModuleReadOnlyRendererRegistry {
  const store = new Map<string, ComponentType<ModuleReadOnlyRendererProps>>();
  return {
    register({ moduleId, Renderer }) {
      store.set(moduleId, Renderer);
    },
    get(moduleId) {
      return store.get(moduleId);
    },
  };
}
