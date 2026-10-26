import { PACKAGE_MEDIA_PREFIX } from "@/core/project-sharing/module-media";

/**
 * How media is referenced on Drive. WHERE each file goes is decided by the one
 * shared layout (core/media-layout); the Drive backup puts that tree under the
 * point folder's media/ folder and writes, into module data, a marker carrying
 * the exact path relative to the point folder, which a restore follows
 * literally.
 */

/** `package-media:<relative path>` - the marker written into module data on Drive. */
export function toDriveMediaMarker(relativePath: string): string {
  return `${PACKAGE_MEDIA_PREFIX}${relativePath}`;
}

/** The relative path inside a marker, or null when the value is not a marker. */
export function fromDriveMediaMarker(value: string): string | null {
  return value.startsWith(PACKAGE_MEDIA_PREFIX) ? value.slice(PACKAGE_MEDIA_PREFIX.length) : null;
}

export function splitRelativePath(relativePath: string): string[] {
  return relativePath.split("/").filter((segment) => segment.length > 0);
}
