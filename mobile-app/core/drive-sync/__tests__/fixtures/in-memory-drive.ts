// An in-memory Google Drive for the backup/restore suites: a tree of nodes
// behind the same functions drive-api-client.ts exports. It keeps real
// parent/child structure, so a test can assert the exact folder tree, rename
// a folder after a backup, and count the HTTP calls a flow would make
// (ensureFolder counts as the lookup plus the creation, like the real
// client; listChildren counts one call per page).

export const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
export const ROOT_ID = "root";

export interface DriveNode {
  id: string;
  name: string;
  parentId: string;
  mimeType: string;
  json?: unknown;
  bytes?: string;
  modifiedTime: string;
}

export type DriveOperation =
  | "findChildByName"
  | "createFolder"
  | "listChildren"
  | "uploadJsonFile"
  | "updateJsonFile"
  | "uploadBinaryFile"
  | "updateBinaryFile"
  | "readJsonFile"
  | "downloadBinaryFile";

/** The slice of the fake filesystem the Drive needs to move bytes in and out. */
export interface FakeFsState {
  get(uri: string): { isDir: boolean; content?: string } | undefined;
  set(uri: string, value: { isDir: boolean; content?: string }): unknown;
}

export function createInMemoryDrive(fs: FakeFsState) {
  let nodes = new Map<string, DriveNode>();
  let nextId = 1;
  let calls: Partial<Record<DriveOperation, number>> = {};
  let pageSize = 1000;
  // Lets a test make one operation fail: return true to throw for (operation, name).
  let failWhen: ((operation: DriveOperation, name: string) => boolean) | null = null;

  const record = (operation: DriveOperation, name = "") => {
    calls[operation] = (calls[operation] ?? 0) + 1;
    if (failWhen?.(operation, name)) throw new Error(`Drive ${operation} failed for ${name}`);
  };

  // Insertion order is the listing order, like Drive's unspecified-but-stable one.
  const childrenOf = (parentId: string) => [...nodes.values()].filter((n) => n.parentId === parentId);
  const toDriveFile = (n: DriveNode) => ({
    id: n.id,
    name: n.name,
    mimeType: n.mimeType,
    modifiedTime: n.modifiedTime,
  });

  function createNode(partial: Omit<DriveNode, "id" | "modifiedTime"> & { modifiedTime?: string }): DriveNode {
    const node: DriveNode = { id: `node-${nextId++}`, modifiedTime: "2026-05-06T07:08:09.000Z", ...partial };
    nodes.set(node.id, node);
    return node;
  }

  const api = {
    findChildByName: async (parentId: string, name: string) => {
      record("findChildByName", name);
      const found = childrenOf(parentId).find((n) => n.name === name);
      return found ? toDriveFile(found) : null;
    },
    createFolder: async (name: string, parentId: string) => {
      record("createFolder", name);
      return toDriveFile(createNode({ name, parentId, mimeType: FOLDER_MIME_TYPE }));
    },
    ensureFolder: async (name: string, parentId: string) => {
      const existing = await api.findChildByName(parentId, name);
      if (existing) return existing.id;
      return (await api.createFolder(name, parentId)).id;
    },
    /** Serves the folder page by page like the real client: one call per page, all pages returned. */
    listChildren: async (parentId: string) => {
      const all = childrenOf(parentId);
      const pages = Math.max(1, Math.ceil(all.length / pageSize));
      for (let page = 0; page < pages; page++) record("listChildren", parentId);
      return all.map(toDriveFile);
    },
    uploadBinaryFile: async (name: string, parentId: string, localUri: string, mimeType: string) => {
      record("uploadBinaryFile", name);
      return toDriveFile(createNode({ name, parentId, mimeType, bytes: fs.get(localUri)?.content }));
    },
    updateBinaryFile: async (fileId: string, localUri: string, _mimeType?: string) => {
      record("updateBinaryFile", nodes.get(fileId)?.name);
      nodes.get(fileId)!.bytes = fs.get(localUri)?.content;
      return toDriveFile(nodes.get(fileId)!);
    },
    uploadJsonFile: async (name: string, parentId: string, content: unknown) => {
      record("uploadJsonFile", name);
      return toDriveFile(
        createNode({ name, parentId, mimeType: "application/json", json: JSON.parse(JSON.stringify(content)) }),
      );
    },
    updateJsonFile: async (fileId: string, content: unknown) => {
      record("updateJsonFile", nodes.get(fileId)?.name);
      nodes.get(fileId)!.json = JSON.parse(JSON.stringify(content));
      return toDriveFile(nodes.get(fileId)!);
    },
    readJsonFile: async (fileId: string) => {
      record("readJsonFile", nodes.get(fileId)?.name);
      return nodes.get(fileId)!.json;
    },
    downloadBinaryFile: async (fileId: string, destinationUri: string) => {
      record("downloadBinaryFile", nodes.get(fileId)?.name);
      fs.set(destinationUri, { isDir: false, content: nodes.get(fileId)!.bytes });
    },
  };

  /** Every descendant of `rootId` as a sorted list of paths; folders end with "/". */
  function tree(rootId: string = ROOT_ID): string[] {
    const paths: string[] = [];
    const walk = (parentId: string, prefix: string) => {
      for (const child of childrenOf(parentId)) {
        const isFolder = child.mimeType === FOLDER_MIME_TYPE;
        paths.push(`${prefix}${child.name}${isFolder ? "/" : ""}`);
        if (isFolder) walk(child.id, `${prefix}${child.name}/`);
      }
    };
    walk(rootId, "");
    return paths.sort();
  }

  /** Finds a node by slash-separated path from `rootId`. */
  function nodeAt(path: string, rootId: string = ROOT_ID): DriveNode | undefined {
    let current: DriveNode | undefined;
    let parentId = rootId;
    for (const segment of path.split("/").filter(Boolean)) {
      current = childrenOf(parentId).find((n) => n.name === segment);
      if (!current) return undefined;
      parentId = current.id;
    }
    return current;
  }

  return {
    api,
    createNode,
    tree,
    nodeAt,
    childrenOf,
    /** Total HTTP calls made so far, or the count of one operation. */
    callCount: (operation?: DriveOperation) =>
      operation ? (calls[operation] ?? 0) : Object.values(calls).reduce((sum, n) => sum + (n ?? 0), 0),
    callBreakdown: () => ({ ...calls }),
    resetCalls: () => {
      calls = {};
    },
    renameNode: (id: string, name: string) => {
      nodes.get(id)!.name = name;
    },
    setPageSize: (size: number) => {
      pageSize = size;
    },
    failWhen: (predicate: ((operation: DriveOperation, name: string) => boolean) | null) => {
      failWhen = predicate;
    },
    /** Empties the Drive and recreates the project root folder (with an empty approved/ like activation leaves it). */
    reset: () => {
      nodes = new Map();
      nextId = 1;
      calls = {};
      failWhen = null;
      pageSize = 1000;
      nodes.set(ROOT_ID, {
        id: ROOT_ID,
        name: "Projeto",
        parentId: "",
        mimeType: FOLDER_MIME_TYPE,
        modifiedTime: "x",
      });
    },
  };
}
