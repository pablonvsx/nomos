import {
  ProjectRoleNotAllowedError,
  assertProjectActionAllowed,
  getProjectActionVisibility,
  type ProjectActionVisibility,
} from "../action-visibility";

// Section 10.0 of COLLAB_MODEL_REFERENCE.md, written out literally: one row
// per action, columns are role = NULL | 'collaborator' | 'owner'.
const TABLE: Array<[keyof ProjectActionVisibility, boolean, boolean, boolean]> = [
  ["exportConfigPackage", true, false, true],
  ["activateDriveBackup", true, false, false],
  ["exportPointsToOwner", false, true, false],
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

    expect(shown(null)).toEqual(["activateDriveBackup", "exportConfigPackage"]);
    expect(shown("collaborator")).toEqual(["exportPointsToOwner"]);
    expect(shown("owner")).toEqual([
      "backup",
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

describe("assertProjectActionAllowed (service-side guard, same table)", () => {
  it("allows exactly what the table allows and throws ProjectRoleNotAllowedError otherwise", () => {
    const roles = [null, "collaborator", "owner"] as const;
    for (const [action, forNull, forCollab, forOwner] of TABLE) {
      const allowed = [forNull, forCollab, forOwner];
      roles.forEach((role, i) => {
        if (allowed[i]) {
          expect(() => assertProjectActionAllowed(role, action)).not.toThrow();
        } else {
          expect(() => assertProjectActionAllowed(role, action)).toThrow(ProjectRoleNotAllowedError);
        }
      });
    }
  });

  it("the error carries the action and the role, with a clear message", () => {
    try {
      assertProjectActionAllowed("collaborator", "exportConfigPackage");
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectRoleNotAllowedError);
      const typed = error as ProjectRoleNotAllowedError;
      expect(typed.name).toBe("ProjectRoleNotAllowedError");
      expect(typed.action).toBe("exportConfigPackage");
      expect(typed.role).toBe("collaborator");
      expect(typed.message).toContain("colaborador");
    }
  });

  it("treats undefined like a plain local project", () => {
    expect(() => assertProjectActionAllowed(undefined, "exportConfigPackage")).not.toThrow();
    expect(() => assertProjectActionAllowed(undefined, "importPoints")).toThrow(ProjectRoleNotAllowedError);
  });

  it("no longer carries the unused collectPoints / collectorCode flags", () => {
    const keys = Object.keys(getProjectActionVisibility("owner"));
    expect(keys).not.toContain("collectPoints");
    expect(keys).not.toContain("collectorCode");
  });
});
