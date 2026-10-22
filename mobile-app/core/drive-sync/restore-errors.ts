/**
 * Thrown when a point's photo or audio could not be brought down from Drive
 * during a restore. A restore is all-or-nothing: media is part of the
 * collection, so a point is never restored without it. Kept in its own
 * dependency-free file so restore-error-messages.ts can use `instanceof`
 * without importing restore-service.ts and its native dependencies.
 */
export class MediaRestoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MediaRestoreError";
  }
}
