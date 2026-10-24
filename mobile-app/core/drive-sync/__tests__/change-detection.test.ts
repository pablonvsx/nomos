import {
  deriveStatus,
  diffAgainstSnapshot,
  fingerprintOf,
  unverifiableStatus,
  type BackupItem,
} from "../change-detection";

const item = (key: string, value: unknown): BackupItem => ({ key, kind: "species", label: key, fingerprint: fingerprintOf(value) });

describe("fingerprintOf", () => {
  it("does not depend on object key order", () => {
    expect(fingerprintOf({ a: 1, b: { c: 2, d: [1, 2] } })).toBe(fingerprintOf({ b: { d: [1, 2], c: 2 }, a: 1 }));
  });

  it("changes when any value changes, including array order", () => {
    expect(fingerprintOf({ a: 1 })).not.toBe(fingerprintOf({ a: 2 }));
    expect(fingerprintOf([1, 2])).not.toBe(fingerprintOf([2, 1]));
    expect(fingerprintOf({ a: null })).not.toBe(fingerprintOf({ a: "" }));
  });

  it("treats undefined fields as absent", () => {
    expect(fingerprintOf({ a: 1, b: undefined })).toBe(fingerprintOf({ a: 1 }));
  });
});

describe("diffAgainstSnapshot", () => {
  const snapshot = new Map([
    ["point:1", item("point:1", "v1").fingerprint],
    ["point:2", item("point:2", "v1").fingerprint],
  ]);

  it("reports nothing when the project matches the snapshot", () => {
    const diff = diffAgainstSnapshot([item("point:1", "v1"), item("point:2", "v1")], snapshot);
    expect(diff).toEqual({ added: [], changed: [], removedKeys: [] });
  });

  it("tells new, edited and deleted items apart", () => {
    const diff = diffAgainstSnapshot([item("point:1", "EDITED"), item("point:3", "new")], snapshot);
    expect(diff.added.map((i) => i.key)).toEqual(["point:3"]);
    expect(diff.changed.map((i) => i.key)).toEqual(["point:1"]);
    expect(diff.removedKeys).toEqual(["point:2"]);
  });
});

describe("deriveStatus", () => {
  const empty = { added: [], changed: [], removedKeys: [] };

  it("is up to date with nothing to do, keeping the last backup time", () => {
    const status = deriveStatus({ diff: empty, hasBackedUpBefore: true, lastBackupAt: "2026-10-01T10:00:00Z" });
    expect(status).toMatchObject({ kind: "upToDate", pendingCount: 0, lastBackupAt: "2026-10-01T10:00:00Z" });
  });

  it("is 'never' when there is pending work and no backup ever ran", () => {
    const status = deriveStatus({ diff: { ...empty, added: [item("a", 1)] }, hasBackedUpBefore: false, lastBackupAt: null });
    expect(status).toMatchObject({ kind: "never", pendingCount: 1 });
    expect([...status.pendingKeys]).toEqual(["a"]);
  });

  it("is 'pending' after a backup, counting removals too but listing only items to send", () => {
    const status = deriveStatus({
      diff: { added: [item("a", 1)], changed: [item("b", 2)], removedKeys: ["c"] },
      hasBackedUpBefore: true,
      lastBackupAt: "x",
    });
    expect(status.kind).toBe("pending");
    expect(status.pendingCount).toBe(3);
    expect([...status.pendingKeys].sort()).toEqual(["a", "b"]);
  });

  it("builds an unverifiable status with its reason", () => {
    expect(unverifiableStatus("account", "t")).toMatchObject({ kind: "unverifiable", reason: "account", lastBackupAt: "t" });
  });
});
