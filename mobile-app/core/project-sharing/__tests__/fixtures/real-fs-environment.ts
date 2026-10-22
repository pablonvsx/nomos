/**
 * A REAL filesystem + REAL zip environment for the points package tests.
 *
 * fake-environment.ts keeps files in a Map and "zips" by serializing that Map
 * to JSON, so it can never notice a zip that is missing a file. This module
 * instead mirrors the expo-file-system SDK 19 API (File/Directory/Paths) on
 * top of node's `fs`, writing real bytes under os.tmpdir(), and implements
 * zip()/unzip() with jszip on real files. Tests can then open the produced
 * .zip with a real zip reader and check what is physically inside it.
 *
 * Limit: this verifies what the JS code stages and hands to zip(); it does not
 * exercise the native zip4j/SSZipArchive libraries used on a device.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import JSZip from "jszip";

function toFsPath(uri: string): string {
  return uri.startsWith("file://") ? uri.slice("file://".length) : uri;
}

function joinParts(parts: Array<string | { uri: string }>): string {
  const segments = parts.map((p) => (typeof p === "string" ? p : p.uri));
  let result = segments[0];
  for (let i = 1; i < segments.length; i++) {
    result = `${result.replace(/\/+$/, "")}/${segments[i].replace(/^\/+/, "")}`;
  }
  return result;
}

export class RealFile {
  uri: string;

  constructor(...parts: Array<string | { uri: string }>) {
    this.uri = joinParts(parts).replace(/\/+$/, "");
  }

  get exists(): boolean {
    const p = toFsPath(this.uri);
    return fs.existsSync(p) && fs.statSync(p).isFile();
  }

  get size(): number {
    return this.exists ? fs.statSync(toFsPath(this.uri)).size : 0;
  }

  get name(): string {
    return path.basename(toFsPath(this.uri));
  }

  // Sync, like the real SDK 19 API.
  write(content: string): void {
    fs.writeFileSync(toFsPath(this.uri), content);
  }

  async text(): Promise<string> {
    return fs.readFileSync(toFsPath(this.uri), "utf8");
  }

  create(): void {
    if (!this.exists) fs.writeFileSync(toFsPath(this.uri), "");
  }

  // Sync and returns void, like the real SDK 19 API. Destination may be a
  // File or a Directory (copied in under the same name).
  copy(destination: RealFile | RealDirectory): void {
    const target =
      destination instanceof RealDirectory
        ? path.join(toFsPath(destination.uri), this.name)
        : toFsPath(destination.uri);
    fs.copyFileSync(toFsPath(this.uri), target);
  }

  move(destination: RealFile | RealDirectory): void {
    this.copy(destination);
    fs.unlinkSync(toFsPath(this.uri));
  }

  delete(): void {
    fs.rmSync(toFsPath(this.uri), { force: true });
  }
}

export class RealDirectory {
  uri: string;

  constructor(...parts: Array<string | { uri: string }>) {
    // The real SDK 19 Directory.uri carries a trailing slash.
    this.uri = `${joinParts(parts).replace(/\/+$/, "")}/`;
  }

  get exists(): boolean {
    const p = toFsPath(this.uri);
    return fs.existsSync(p) && fs.statSync(p).isDirectory();
  }

  get name(): string {
    return path.basename(toFsPath(this.uri));
  }

  // Like the real API: throws if the directory already exists unless
  // idempotent is set, and needs `intermediates` to create missing parents.
  create(options: { intermediates?: boolean; idempotent?: boolean } = {}): void {
    if (this.exists) {
      if (options.idempotent) return;
      throw new Error(`Directory already exists: ${this.uri}`);
    }
    fs.mkdirSync(toFsPath(this.uri), { recursive: Boolean(options.intermediates) });
  }

  delete(): void {
    fs.rmSync(toFsPath(this.uri), { recursive: true, force: true });
  }

  list(): Array<RealFile | RealDirectory> {
    const dir = toFsPath(this.uri);
    return fs.readdirSync(dir).map((name) => {
      const full = path.join(dir, name);
      return fs.statSync(full).isDirectory()
        ? new RealDirectory(`file://${full}`)
        : new RealFile(`file://${full}`);
    });
  }
}

let rootDir: string | null = null;

/** Creates a fresh tmp root with `cache/` and `document/` and returns it. */
export function resetRealFs(): string {
  if (rootDir) fs.rmSync(rootDir, { recursive: true, force: true });
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "nomos-real-fs-"));
  fs.mkdirSync(path.join(rootDir, "cache"));
  fs.mkdirSync(path.join(rootDir, "document"));
  fs.mkdirSync(path.join(rootDir, "device"));
  return rootDir;
}

export function removeRealFs(): void {
  if (rootDir) fs.rmSync(rootDir, { recursive: true, force: true });
  rootDir = null;
}

function requireRoot(): string {
  if (!rootDir) throw new Error("resetRealFs() must be called before using RealPaths");
  return rootDir;
}

// Paths.cache / Paths.document are read lazily so resetRealFs() can move them.
export const RealPaths = {
  get cache(): RealDirectory {
    return new RealDirectory(`file://${path.join(requireRoot(), "cache")}`);
  },
  get document(): RealDirectory {
    return new RealDirectory(`file://${path.join(requireRoot(), "document")}`);
  },
};

/**
 * Writes a file standing in for a photo/audio that lives somewhere on the
 * "device" outside the app's own storage (e.g. the image picker's cache dir).
 * Returns its file:// URI.
 */
export function createDeviceMedia(name: string, bytes: Buffer): string {
  const dir = path.join(requireRoot(), "device");
  fs.mkdirSync(dir, { recursive: true });
  const full = path.join(dir, name);
  fs.writeFileSync(full, bytes);
  return `file://${full}`;
}

function addDirectoryToZip(zip: JSZip, dirPath: string, zipPrefix: string): void {
  for (const name of fs.readdirSync(dirPath)) {
    const full = path.join(dirPath, name);
    if (fs.statSync(full).isDirectory()) {
      addDirectoryToZip(zip, full, `${zipPrefix}${name}/`);
    } else {
      zip.file(`${zipPrefix}${name}`, fs.readFileSync(full));
    }
  }
}

/** Real react-native-zip-archive zip(): writes an actual .zip of the directory's contents. */
export const realZip = jest.fn(async (sourcePath: string, targetPath: string) => {
  const zip = new JSZip();
  addDirectoryToZip(zip, sourcePath, "");
  const data = await zip.generateAsync({ type: "nodebuffer" });
  fs.writeFileSync(targetPath, data);
  return targetPath;
});

/** Real react-native-zip-archive unzip(): extracts an actual .zip into the directory. */
export const realUnzip = jest.fn(async (sourcePath: string, targetPath: string) => {
  const zip = await JSZip.loadAsync(fs.readFileSync(sourcePath));
  for (const [name, entry] of Object.entries(zip.files)) {
    const dest = path.join(targetPath, name);
    if (entry.dir) {
      fs.mkdirSync(dest, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, await entry.async("nodebuffer"));
    }
  }
  return targetPath;
});

/** Opens a real .zip file (by file:// URI or path) for inspection. */
export async function openZip(uriOrPath: string): Promise<JSZip> {
  return JSZip.loadAsync(fs.readFileSync(toFsPath(uriOrPath)));
}
