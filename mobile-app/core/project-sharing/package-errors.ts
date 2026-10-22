/**
 * Shared error types for both packages (project configuration, Fase 0, and
 * points, Fase 2). Kept dependency-free on purpose - importing either
 * package module just to reuse these classes would pull in its whole
 * db/queries chain (and, transitively, expo-sqlite's native binding).
 */

/** Thrown when a package's format_version isn't one this build understands. */
export class UnsupportedPackageVersionError extends Error {
  constructor() {
    super(
      "Este arquivo foi criado por uma versão mais nova do Nomos e não pode ser importado nesta versão do aplicativo.",
    );
    this.name = "UnsupportedPackageVersionError";
  }
}

/** Thrown when a package is missing required fields or isn't well-formed. */
export class InvalidPackageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPackageError";
  }
}
