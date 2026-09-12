// Minimal in-memory stand-in for expo-file-system's File/Directory/Paths,
// shared between the "expo-file-system" and "react-native-zip-archive"
// jest.mock() factories in export-import-audio.test.ts, so a real
// export -> zip -> unzip -> import cycle can be exercised without touching
// the native filesystem. Not a full API surface - only what
// export-points.ts / import-points.ts actually call.

type PathLike = string | { uri: string };

const files = new Map<string, string>();
const directories = new Set<string>();
const archives = new Map<string, Map<string, string>>();

function toUriPart(part: PathLike): string {
  return typeof part === "string" ? part : part.uri;
}

function joinUri(parts: PathLike[]): string {
  return parts.map(toUriPart).join("/");
}

export class File {
  readonly uri: string;

  constructor(...parts: PathLike[]) {
    this.uri = joinUri(parts);
  }

  get exists(): boolean {
    return files.has(this.uri);
  }

  async text(): Promise<string> {
    return files.get(this.uri) ?? "";
  }

  write(content: string): void {
    files.set(this.uri, content);
  }

  copy(destination: { uri: string }): void {
    const content = files.get(this.uri);
    if (content !== undefined) {
      files.set(destination.uri, content);
    }
  }

  delete(): void {
    files.delete(this.uri);
  }
}

export class Directory {
  readonly uri: string;

  constructor(...parts: PathLike[]) {
    this.uri = joinUri(parts);
  }

  get exists(): boolean {
    return directories.has(this.uri);
  }

  create(): void {
    directories.add(this.uri);
  }

  async delete(): Promise<void> {
    directories.delete(this.uri);
    const prefix = `${this.uri}/`;
    for (const key of Array.from(files.keys())) {
      if (key.startsWith(prefix)) files.delete(key);
    }
    for (const key of Array.from(directories)) {
      if (key.startsWith(prefix)) directories.delete(key);
    }
  }
}

export const Paths = {
  cache: "mock-cache",
  document: "mock-document",
};

// --- react-native-zip-archive fake, sharing the same `files` store ---

export async function zip(sourcePath: string, destPath: string): Promise<string> {
  const prefix = `${sourcePath}/`;
  const snapshot = new Map<string, string>();
  for (const [uri, content] of files.entries()) {
    if (uri.startsWith(prefix)) {
      snapshot.set(uri.slice(prefix.length), content);
    }
  }
  archives.set(destPath, snapshot);
  return destPath;
}

export async function unzip(sourcePath: string, destPath: string): Promise<string> {
  const snapshot = archives.get(sourcePath);
  if (!snapshot) {
    throw new Error(`fake-file-system: no archive staged at ${sourcePath}`);
  }
  for (const [relativePath, content] of snapshot.entries()) {
    files.set(`${destPath}/${relativePath}`, content);
  }
  directories.add(destPath);
  return destPath;
}

// --- test-only helpers (not part of any real API) ---

export function __setFile(uri: string, content: string): void {
  files.set(uri, content);
}

export function __getFile(uri: string): string | undefined {
  return files.get(uri);
}

export function __archivePaths(): string[] {
  return Array.from(archives.keys());
}

export function __resetFakeFileSystem(): void {
  files.clear();
  directories.clear();
  archives.clear();
}
