import {
  getProjectActionVisibility,
  type ProjectActionVisibility,
} from "../action-visibility";

// Section 10.0 of COLLAB_MODEL_REFERENCE.md, written out literally: one row
// per action, columns are role = NULL | 'collaborator' | 'owner'.
const TABLE: Array<[keyof ProjectActionVisibility, boolean, boolean, boolean]> = [
  ["collectPoints", true, true, true],
  ["exportConfigPackage", true, false, true],
  ["activateDriveBackup", true, false, false],
  ["exportPointsToOwner", false, true, false],
  ["collectorCode", false, true, false],
  ["backup", false, false, true],
  ["pendingApprovals", false, false, true],
  ["rejectedPoints", false, false, true],
  // Not a table row: owner-side half of the points package flow (section 5).
  ["importPoints", false, false, true],
];

describe("getProjectActionVisibility (section 10.0 table)", () => {
  it.each(TABLE)("%s: NULL=%s, collaborator=%s, owner=%s", (action, forNull, forCollab, forOwner) => {
    expect(getProjectActionVisibility(null)[action]).toBe(forNull);
    expect(getProjectActionVisibility("collaborator")[action]).toBe(forCollab);
    expect(getProjectActionVisibility("owner")[action]).toBe(forOwner);
  });

  it("treats undefined like NULL (a project that was never shared)", () => {
    expect(getProjectActionVisibility(undefined)).toEqual(getProjectActionVisibility(null));
  });

  it("shows exactly these actions per role, side by side", () => {
    const shown = (role: "owner" | "collaborator" | null) =>
      Object.entries(getProjectActionVisibility(role))
        .filter(([, visible]) => visible)
        .map(([action]) => action)
        .sort();

    expect(shown(null)).toEqual(["activateDriveBackup", "collectPoints", "exportConfigPackage"]);
    expect(shown("collaborator")).toEqual(["collectPoints", "collectorCode", "exportPointsToOwner"]);
    expect(shown("owner")).toEqual([
      "backup",
      "collectPoints",
      "exportConfigPackage",
      "importPoints",
      "pendingApprovals",
      "rejectedPoints",
    ]);
  });

  it("never offers a collaborator copy any owner or not-yet-shared action", () => {
    const v = getProjectActionVisibility("collaborator");
    expect(v.exportConfigPackage).toBe(false);
    expect(v.activateDriveBackup).toBe(false);
    expect(v.backup).toBe(false);
    expect(v.pendingApprovals).toBe(false);
    expect(v.rejectedPoints).toBe(false);
    expect(v.importPoints).toBe(false);
  });
});
