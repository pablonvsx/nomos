import { UnsupportedPackageVersionError } from "@/core/project-sharing/package-errors";

/**
 * Maps an error thrown by restoreOwnProjectFromDrive to the i18n key that
 * should be shown to the user. Kept as a pure function, separate from
 * RestoreProjectsModal.tsx, because this project's Jest setup
 * (testEnvironment: "node", no react-test-renderer) can't render React
 * components - the same split already used since Fase 4 for
 * use-google-account.ts/google-account-controller.ts.
 *
 * Matches by exact message text against the fixed strings
 * restore-service.ts throws - not ideal long-term (fragile to message
 * wording changes), but avoids introducing new error classes solely for
 * this mapping. UnsupportedPackageVersionError already exists as a proper
 * class (package-errors.ts, dependency-free), so that one case checks
 * `instanceof` instead, more robust than the other three.
 */

export interface RestoreErrorDescription {
  key: string;
  /** Only set for the generic fallback - the original technical message,
   * so nothing is silently discarded (audit finding IMPORTANTE 2). Every
   * other, specifically-mapped error already has a friendly translation
   * of its own and doesn't need this. */
  technicalDetail?: string;
}

export function describeRestoreError(error: unknown): RestoreErrorDescription {
  if (error instanceof UnsupportedPackageVersionError) {
    return { key: "driveRestore.errorUnsupportedFormatVersion" };
  }

  const message = error instanceof Error ? error.message : String(error);

  switch (message) {
    case "Este projeto já existe neste dispositivo.":
      return { key: "driveRestore.errorAlreadyExists" };
    case "manifest.json incompleto ou corrompido.":
      return { key: "driveRestore.errorIncompleteManifest" };
    case "Protocolo personalizado deste projeto não encontrado no Drive.":
      return { key: "driveRestore.errorProtocolNotFound" };
    default:
      return { key: "driveRestore.errorRestoring", technicalDetail: message };
  }
}
