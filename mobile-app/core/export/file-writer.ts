import { File, Directory, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { zip } from "react-native-zip-archive";
import { createMediaPathAllocator } from "@/core/media-layout/allocator";
import type { MediaLabelIndex } from "@/core/media-layout/labels";
import { MediaFiles } from "./types";

export function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes("\n") || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function writeAndShare(
  filename: string,
  content: string,
  mimeType: string,
): Promise<void> {
  const tempFile = new File(Paths.cache, filename);
  await tempFile.write(content);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(tempFile.uri, { mimeType });
  }
}

/**
 * "Exportar mídia": a zip of every point's photos and audio notes for people to
 * browse. Each point gets a Point_<n>/ folder laid out by the shared media layout
 * (core/media-layout): photos/, audio/, section_<title>/, group_<title>/item_NN/.
 * Folders exist only when they hold a file. Audio files carry their recording
 * time in the name, and the point's text notes go to notes.txt.
 */
export async function exportMedia(
  points: Array<{ pointNumber: number }>,
  extractMediaFn: (point: any) => Promise<MediaFiles>,
  projectName: string,
  labels: MediaLabelIndex = new Map(),
): Promise<boolean> {
  const exportDir = new Directory(Paths.cache, `media_export_${Date.now()}`);
  if (exportDir.exists) await exportDir.delete();
  await exportDir.create();

  try {
    let hasMedia = false;

    for (const point of points) {
      const { media, notes } = await extractMediaFn(point);

      if (media.length > 0 || notes.length > 0) {
        hasMedia = true;
        const pointDir = new Directory(exportDir, `Point_${point.pointNumber}`);
        await pointDir.create();

        // A fresh allocator per point: names are unique within one point's tree.
        const paths = createMediaPathAllocator(labels, { audioNaming: "dated" });
        let photoIndex = 0;
        let audioIndex = 0;
        for (const entry of media) {
          let relativePath: string;
          if (entry.origin) {
            relativePath = paths.moduleMedia({ ...entry.origin, kind: entry.kind }, entry.uri, entry.timestamp);
          } else if (entry.kind === "photo") {
            relativePath = paths.pointPhoto(entry.uri, photoIndex++);
          } else {
            relativePath = paths.pointAudio(entry.uri, audioIndex++, entry.timestamp);
          }
          const dest = new File(pointDir, relativePath);
          await new Directory(dest.uri.split("/").slice(0, -1).join("/")).create({
            intermediates: true,
            idempotent: true,
          });
          await new File(entry.uri).copy(dest);
        }

        if (notes.length > 0) {
          await new File(pointDir, "notes.txt").write(notes.join("\n\n"));
        }
      }
    }

    if (!hasMedia) return false;

    const safeProjectName = projectName.replace(/[^a-z0-9]/gi, "_");
    const zipFile = new File(Paths.cache, `${safeProjectName}_media.zip`);
    await zip(exportDir.uri.replace("file://", ""), zipFile.uri.replace("file://", ""));
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(zipFile.uri);
    return true;
  } finally {
    if (exportDir.exists) await exportDir.delete();
  }
}
