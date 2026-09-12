// Finds and rewrites photo_input/audio_notes_input field values embedded
// inside a custom protocol's module data (including repeatable_group items).
// export-points.ts/import-points.ts only used to touch the point's own fixed
// photos/audio_notes fields - a custom protocol's own module-level photo/audio
// fields kept their original device-local uri untouched through export and
// import, breaking after import onto another device (see
// COLLAB_MODEL_V2_REFERENCE.md, section 12). This walks the same schema used
// to render those fields (modules/custom/manifest.ts) so both sides can
// locate them generically instead of hardcoding field ids.
import { getCustomProtocolById } from "@/db/queries/custom-protocols";
import { buildCustomModuleDescriptor } from "@/modules/custom/manifest";
import type { Project } from "@/types/database";
import type { ModuleDescriptor } from "@/protocol-kernel/types";

export async function resolveCustomModuleDescriptors(project: Project): Promise<ModuleDescriptor[]> {
  if (project.protocol_source !== "custom") return [];
  const cpId = Number(project.protocol_id);
  if (Number.isNaN(cpId)) return [];
  const cp = await getCustomProtocolById(cpId);
  if (!cp) return [];
  return cp.schema.sections.map(buildCustomModuleDescriptor);
}

const MEDIA_RENDER_TYPES = new Set(["photo_input", "audio_notes_input"]);

export interface MediaFieldLocation {
  /** Deterministic across export and import as long as both walk the same
   *  descriptors in the same order - used to derive a matching media
   *  subfolder on each side without needing to serialize a path. */
  locatorKey: string;
  read(): string | null;
  write(newValue: string): void;
}

export function forEachModuleMediaField(
  modules: Record<string, unknown>,
  descriptors: ModuleDescriptor[],
  visit: (loc: MediaFieldLocation) => void,
): void {
  for (const descriptor of descriptors) {
    const data = modules[descriptor.id];
    if (!data || typeof data !== "object") continue;
    const dict = data as Record<string, unknown>;

    for (const field of descriptor.schema.fields) {
      if (!field.renderAs || !MEDIA_RENDER_TYPES.has(field.renderAs)) continue;
      visit({
        locatorKey: `${descriptor.id}_${field.id}`,
        read: () => (typeof dict[field.id] === "string" ? (dict[field.id] as string) : null),
        write: (newValue) => {
          dict[field.id] = newValue;
        },
      });
    }

    for (const group of descriptor.schema.dynamic ?? []) {
      const items = dict[group.groupId];
      if (!Array.isArray(items)) continue;

      items.forEach((item, itemIndex) => {
        if (!item || typeof item !== "object") return;
        const itemDict = item as Record<string, unknown>;
        for (const subField of group.itemFields) {
          if (!subField.renderAs || !MEDIA_RENDER_TYPES.has(subField.renderAs)) continue;
          visit({
            locatorKey: `${descriptor.id}_${group.groupId}_${itemIndex}_${subField.id}`,
            read: () => (typeof itemDict[subField.id] === "string" ? (itemDict[subField.id] as string) : null),
            write: (newValue) => {
              itemDict[subField.id] = newValue;
            },
          });
        }
      });
    }
  }
}
