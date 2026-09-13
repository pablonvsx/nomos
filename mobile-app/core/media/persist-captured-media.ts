// expo-image-picker/expo-audio return URIs pointing into OS-managed cache/
// temp storage (Android app cache dir, iOS tmp/Caches) - the OS is free to
// reclaim those at any time (low storage, app backgrounded, app update),
// silently losing a point's media by the time it's exported/backed up much
// later. Every other media path in the app (core/project-sharing/import-points.ts,
// core/drive-sync/project-drive-service.ts) already persists incoming media
// into Paths.document for exactly this reason; this does the same for
// locally captured media at the moment of capture.
import { File, Paths } from "expo-file-system";
import { generateUuid } from "@/utils/uuid";

export function persistCapturedMedia(sourceUri: string, prefix: string): string {
  try {
    const sourceFile = new File(sourceUri);
    const originalName = sourceUri.split("/").pop() ?? "";
    const ext = originalName.includes(".") ? originalName.split(".").pop() : undefined;
    const destFile = new File(Paths.document, ext ? `${prefix}_${generateUuid()}.${ext}` : `${prefix}_${generateUuid()}`);
    sourceFile.copy(destFile);
    return destFile.uri;
  } catch (error) {
    console.error("Error persisting captured media to permanent storage:", error);
    return sourceUri;
  }
}
