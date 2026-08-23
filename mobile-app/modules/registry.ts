import type { ModuleDescriptor, ModuleRendererBinding, LocalizedString } from "@/protocol-kernel/types";
import type { ModuleReadOnlyRendererBinding } from "@/modules/generic/module-read-only-renderer-registry";
import { paisageoManifest } from "./paisageo/manifest";
import { vegetationModule } from "./paisageo/modules/vegetation/vegetation.module";
import { geoecologicalConstraintsModule } from "./paisageo/modules/geoecological-constraints/geoecological-constraints.module";
import { impactsModule } from "./paisageo/modules/impacts/impacts.module";
import { paisageoRendererBindings } from "./paisageo/renderers";
import { paisageoReadOnlyRendererBindings } from "./paisageo/read-only-renderers";

/**
 * Catalog entry for a prefab scientific module (schema + serde + renderers)
 * that any protocol - native or custom - can attach by id, without importing
 * a specific modules/<protocol>/ directly.
 */
export interface SharedModuleCatalogEntry {
  descriptor: ModuleDescriptor;
  renderer: ModuleRendererBinding;
  readOnlyRenderer: ModuleReadOnlyRendererBinding;
  /** Which protocol this module comes from - lets the "attach module" picker group entries by origin. */
  protocolId: string;
  protocolName: LocalizedString;
}

function bindingFor<T extends { moduleId: string }>(list: T[], moduleId: string): T {
  const binding = list.find((b) => b.moduleId === moduleId);
  if (!binding) {
    throw new Error(`[modules/registry] missing renderer binding for module "${moduleId}"`);
  }
  return binding;
}

/**
 * One entry per native protocol that contributes modules to the shared
 * catalog. Adding a future protocol here is the only step needed for its
 * modules to show up (grouped under its own name) in the picker.
 */
const MODULE_SOURCES: {
  protocolId: string;
  protocolName: LocalizedString;
  descriptors: ModuleDescriptor[];
  rendererBindings: ModuleRendererBinding[];
  readOnlyRendererBindings: ModuleReadOnlyRendererBinding[];
}[] = [
  {
    protocolId: paisageoManifest.id,
    protocolName: paisageoManifest.name,
    descriptors: [vegetationModule, geoecologicalConstraintsModule, impactsModule],
    rendererBindings: paisageoRendererBindings,
    readOnlyRendererBindings: paisageoReadOnlyRendererBindings,
  },
];

const CATALOG: Record<string, SharedModuleCatalogEntry> = Object.fromEntries(
  MODULE_SOURCES.flatMap(({ protocolId, protocolName, descriptors, rendererBindings, readOnlyRendererBindings }) =>
    descriptors.map((descriptor) => [
      descriptor.id,
      {
        descriptor,
        renderer: bindingFor(rendererBindings, descriptor.id),
        readOnlyRenderer: bindingFor(readOnlyRendererBindings, descriptor.id),
        protocolId,
        protocolName,
      },
    ]),
  ),
);

export function getSharedModule(moduleId: string): SharedModuleCatalogEntry | undefined {
  return CATALOG[moduleId];
}

export function listSharedModules(): SharedModuleCatalogEntry[] {
  return Object.values(CATALOG);
}

/**
 * Which shared modules are offered to the custom-protocol builder's "attach
 * scientific module" picker. All three Paisageo modules are exposed - see
 * SPEC_FASE_9.
 */
const BUILDER_ATTACHABLE_MODULE_IDS = ["vegetation", "geoecological_constraints", "impacts"];

export function listBuilderAttachableModules(): SharedModuleCatalogEntry[] {
  return BUILDER_ATTACHABLE_MODULE_IDS.map((id) => CATALOG[id]).filter(
    (entry): entry is SharedModuleCatalogEntry => !!entry,
  );
}
