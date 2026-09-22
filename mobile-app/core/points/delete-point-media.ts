import { File } from "expo-file-system";
import { deletePoint } from "@/db/queries/points";
import { parsePhotoUris } from "@/db/mappers/json-utils";
import type { Point } from "@/types/database";

function parseAudioUris(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => (typeof item === "string" ? item : item?.uri))
      .filter((uri): uri is string => typeof uri === "string" && uri.length > 0);
  } catch {
    return [];
  }
}

/**
 * Deletes a point and every media file it references (photos, audio
 * notes), so nothing orphaned is left behind on disk. Single shared
 * deletion path for the app - used by the rejected points area and by the
 * regular point detail screen's delete action, so neither leaks media.
 * A missing source file is not an error here (media can already be gone
 * for unrelated reasons); it's simply skipped.
 */
export async function deletePointPermanently(point: Point): Promise<void> {
  const mediaUris = [...parsePhotoUris(point.photos), ...parseAudioUris(point.audio_notes)];

  for (const uri of mediaUris) {
    const file = new File(uri);
    if (file.exists) {
      await file.delete();
    }
  }

  await deletePoint(point.id);
}
