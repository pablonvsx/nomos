import type { CustomProtocolSchema } from "@/types/database";

/** What a media field is called in the protocol, so folders carry titles instead of ids. */
export interface MediaLabels {
  sectionId: string;
  sectionTitle: string;
  groupKey?: string;
  groupLabel?: string;
  fieldKey: string;
  fieldLabel: string;
}

export type MediaLabelIndex = Map<string, MediaLabels>;

export function mediaLabelKey(moduleId: string, groupId: string | undefined, fieldKey: string): string {
  return `${moduleId}|${groupId ?? ""}|${fieldKey}`;
}

/** Section title, group label and field label of every photo / audio field of a custom protocol. */
export function buildMediaLabelIndex(schema: CustomProtocolSchema): MediaLabelIndex {
  const index: MediaLabelIndex = new Map();
  for (const section of schema.sections) {
    if (section.moduleRef) continue;
    for (const field of section.fields) {
      if (field.type === "photo_input" || field.type === "audio_notes_input") {
        index.set(mediaLabelKey(section.id, undefined, field.key), {
          sectionId: section.id,
          sectionTitle: section.title,
          fieldKey: field.key,
          fieldLabel: field.label,
        });
      } else if (field.type === "repeatable_group") {
        for (const sub of field.itemFields ?? []) {
          if (sub.type !== "photo_input" && sub.type !== "audio_notes_input") continue;
          index.set(mediaLabelKey(section.id, field.key, sub.key), {
            sectionId: section.id,
            sectionTitle: section.title,
            groupKey: field.key,
            groupLabel: field.label,
            fieldKey: sub.key,
            fieldLabel: sub.label,
          });
        }
      }
    }
  }
  return index;
}
