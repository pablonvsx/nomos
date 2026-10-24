import { decideExportGate } from "../export-gate";

const owner = { role: "owner" as const, driveFolderId: "folder-1" };

describe("decideExportGate", () => {
  it("exports directly when the project is up to date", () => {
    expect(decideExportGate({ ...owner, status: "upToDate", online: true })).toEqual({ kind: "direct" });
  });

  it("warns when there are changes the backup does not have", () => {
    expect(decideExportGate({ ...owner, status: "pending", online: true })).toEqual({ kind: "warn", reason: "pending", canBackup: true });
    expect(decideExportGate({ ...owner, status: "never", online: true })).toEqual({ kind: "warn", reason: "pending", canBackup: true });
  });

  it("warns that it could not verify when the status is unverifiable or could not be computed", () => {
    expect(decideExportGate({ ...owner, status: "unverifiable", online: true })).toMatchObject({ kind: "warn", reason: "unverifiable" });
    expect(decideExportGate({ ...owner, status: null, online: true })).toMatchObject({ kind: "warn", reason: "unverifiable" });
  });

  it("offline: still warns, 'export anyway' stays possible, 'back up' is not offered", () => {
    expect(decideExportGate({ ...owner, status: "pending", online: false })).toEqual({ kind: "warn", reason: "pending", canBackup: false });
  });

  it("an unknown connection state does not disable the backup", () => {
    expect(decideExportGate({ ...owner, status: "pending", online: null })).toMatchObject({ canBackup: true });
  });

  it("never warns a collaborator, even with a stale status", () => {
    expect(decideExportGate({ role: "collaborator", driveFolderId: null, status: "pending", online: true })).toEqual({ kind: "direct" });
    expect(decideExportGate({ role: "collaborator", driveFolderId: "x", status: "unverifiable", online: false })).toEqual({ kind: "direct" });
  });

  it("never warns a project that is not linked to Drive", () => {
    expect(decideExportGate({ role: null, driveFolderId: null, status: "pending", online: true })).toEqual({ kind: "direct" });
    expect(decideExportGate({ role: "owner", driveFolderId: null, status: "pending", online: true })).toEqual({ kind: "direct" });
  });
});
