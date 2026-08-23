import { File, Directory, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { zip } from "react-native-zip-archive";
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

export async function exportMedia(
  points: Array<{ pointNumber: number }>,
  extractMediaFn: (point: any) => Promise<MediaFiles>,
  projectName: string,
): Promise<boolean> {
  const exportDir = new Directory(Paths.cache, `media_export_${Date.now()}`);
  if (exportDir.exists) await exportDir.delete();
  await exportDir.create();

  try {
    let hasMedia = false;

    for (const point of points) {
      const { photos, audioNotes, notes } = await extractMediaFn(point);

      if (photos.length > 0 || audioNotes.length > 0 || notes.length > 0) {
        hasMedia = true;
        const pointDir = new Directory(exportDir, `Point_${point.pointNumber}`);
        await pointDir.create();

        for (let i = 0; i < photos.length; i++) {
          const uri = photos[i];
          const ext = uri.split(".").pop() || "jpg";
          await new File(uri).copy(new File(pointDir, `photo_${i + 1}.${ext}`));
        }

        for (let i = 0; i < audioNotes.length; i++) {
          const note = audioNotes[i];
          if (!note?.uri) continue;
          const ext = note.uri.split(".").pop() || "m4a";
          const dateTag = note.timestamp
            ? new Date(note.timestamp)
                .toISOString()
                .replace("T", "_")
                .replace(/:/g, "-")
                .slice(0, 16)
            : "";
          const name = `audio_note_${i + 1}${dateTag ? "_" + dateTag : ""}.${ext}`;
          await new File(note.uri).copy(new File(pointDir, name));
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
