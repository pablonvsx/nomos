/**
 * Shared fake filesystem + zip/unzip + db state used by the points package
 * export/import tests. Not a test file itself (no *.test.ts suffix), so
 * jest's testMatch never picks it up as its own suite - it's required from
 * inside jest.mock(...) factories in export-points.test.ts and
 * import-points.test.ts, each of which gets its own isolated instance of
 * this module (jest resets the module registry per test file).
 */

export interface FakeFsEntry {
  isDir: boolean;
  content?: string;
}

export const fsState = new Map<string, FakeFsEntry>();

export function resetFakeFs(): void {
  fsState.clear();
}

function joinUri(parts: Array<string | { uri: string }>): string {
  const segments = parts.map((p) => (typeof p === "string" ? p : p.uri));
  let result = segments[0];
  for (let i = 1; i < segments.length; i++) {
    result = `${result.replace(/\/+$/, "")}/${segments[i].replace(/^\/+/, "")}`;
  }
  return result;
}

export class FakeFile {
  uri: string;

  constructor(...parts: Array<string | { uri: string }>) {
    this.uri = joinUri(parts);
  }

  get exists(): boolean {
    return fsState.get(this.uri)?.isDir === false;
  }

  get size(): number {
    return fsState.get(this.uri)?.content?.length ?? 0;
  }

  get name(): string {
    return this.uri.split("/").pop() ?? "";
  }

  async write(content: string): Promise<void> {
    fsState.set(this.uri, { isDir: false, content });
  }

  async text(): Promise<string> {
    return fsState.get(this.uri)?.content ?? "";
  }

  async create(): Promise<void> {
    if (!fsState.has(this.uri)) fsState.set(this.uri, { isDir: false, content: "" });
  }

  async copy(destination: FakeFile): Promise<void> {
    fsState.set(destination.uri, { isDir: false, content: fsState.get(this.uri)?.content ?? "" });
  }

  async move(destination: FakeFile): Promise<void> {
    await this.copy(destination);
    fsState.delete(this.uri);
  }

  async delete(): Promise<void> {
    fsState.delete(this.uri);
  }
}

export class FakeDirectory {
  uri: string;

  constructor(...parts: Array<string | { uri: string }>) {
    this.uri = joinUri(parts);
  }

  get exists(): boolean {
    return fsState.get(this.uri)?.isDir === true;
  }

  async create(): Promise<void> {
    fsState.set(this.uri, { isDir: true });
  }

  async delete(): Promise<void> {
    const prefix = `${this.uri}/`;
    for (const key of [...fsState.keys()]) {
      if (key === this.uri || key.startsWith(prefix)) fsState.delete(key);
    }
  }

  list(): Array<FakeFile | FakeDirectory> {
    const prefix = `${this.uri}/`;
    const directChildren = new Set<string>();
    for (const key of fsState.keys()) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      const firstSegment = rest.split("/")[0];
      if (firstSegment) directChildren.add(firstSegment);
    }
    return [...directChildren].map((segment) => {
      const childUri = prefix + segment;
      const entry = fsState.get(childUri);
      return entry?.isDir ? new FakeDirectory(childUri) : new FakeFile(childUri);
    });
  }
}

export const FakePaths = {
  cache: new FakeDirectory("file:///cache"),
  document: new FakeDirectory("file:///document"),
};

/** Fake react-native-zip-archive: serializes the fake fs subtree as JSON. */
export const zipMock = jest.fn(async (sourcePath: string, targetPath: string) => {
  const sourceUri = `file://${sourcePath}`;
  const targetUri = `file://${targetPath}`;
  const snapshot: Record<string, FakeFsEntry> = {};
  for (const [key, value] of fsState.entries()) {
    if (key === sourceUri || key.startsWith(`${sourceUri}/`)) snapshot[key] = value;
  }
  fsState.set(targetUri, {
    isDir: false,
    content: JSON.stringify({ base: sourceUri, entries: snapshot }),
  });
  return targetUri;
});

export const unzipMock = jest.fn(async (sourcePath: string, targetPath: string) => {
  const sourceUri = `file://${sourcePath}`;
  const targetUri = `file://${targetPath}`;
  const zipEntry = fsState.get(sourceUri);
  if (!zipEntry?.content) {
    throw new Error("Fake unzip: source zip not found or empty");
  }
  const { base, entries } = JSON.parse(zipEntry.content) as {
    base: string;
    entries: Record<string, FakeFsEntry>;
  };
  fsState.set(targetUri, { isDir: true });
  for (const [key, value] of Object.entries(entries)) {
    const relative = key.slice(base.length);
    fsState.set(targetUri + relative, value);
  }
  return targetUri;
});

// ---- Fake DB state ----

export interface FakeProjectRow {
  id: number;
  name: string;
  protocol_id: string;
  protocol_source: "official" | "custom";
  project_uuid: string | null;
  owner_email: string | null;
}

export interface FakePointRow {
  id: number;
  project_id: number;
  protocol_id: string;
  point_number: number;
  lat: number;
  lon: number;
  altitude: number | null;
  generated_name: string | null;
  landscape_class_id: number | null;
  photos: string | null;
  audio_notes: string | null;
  additional_notes: string | null;
  point_size: number | null;
  created_at: string;
  uuid: string | null;
  approval_status: "pending" | "approved" | "rejected" | null;
  created_by: string | null;
  rawModules: Array<{ module_id: string; schema_version: string; data_json: string }>;
}

export let projects: FakeProjectRow[] = [];
export let nextProjectId = 1;
export let points: FakePointRow[] = [];
export let nextPointId = 1;
let uuidCounter = 0;

export function nextFakeUuid(prefix: string): string {
  uuidCounter += 1;
  return `${prefix}-uuid-${uuidCounter}`;
}

export function resetFakeDb(): void {
  projects = [];
  nextProjectId = 1;
  points = [];
  nextPointId = 1;
  uuidCounter = 0;
}

export function seedProject(overrides: Partial<FakeProjectRow> = {}): FakeProjectRow {
  const row: FakeProjectRow = {
    id: nextProjectId++,
    name: "Projeto Teste",
    protocol_id: "nomos-paisageo-v1",
    protocol_source: "official",
    project_uuid: null,
    owner_email: null,
    ...overrides,
  };
  projects.push(row);
  return row;
}

export function seedPoint(projectId: number, overrides: Partial<FakePointRow> = {}): FakePointRow {
  const row: FakePointRow = {
    id: nextPointId++,
    project_id: projectId,
    protocol_id: "nomos-paisageo-v1",
    point_number: points.filter((p) => p.project_id === projectId).length + 1,
    lat: -8.05,
    lon: -34.9,
    altitude: null,
    generated_name: null,
    landscape_class_id: null,
    photos: null,
    audio_notes: null,
    additional_notes: null,
    point_size: null,
    created_at: new Date().toISOString(),
    uuid: null,
    approval_status: null,
    created_by: null,
    rawModules: [],
    ...overrides,
  };
  points.push(row);
  return row;
}
