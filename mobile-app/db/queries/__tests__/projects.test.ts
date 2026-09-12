// setProjectCollaborative is the one function that actually writes
// collaboration_role = 'owner' to the projects table, and it has two real
// call sites (the "make collaborative" screen and the "restore my own
// project from Drive" flow) - so the guard against ever promoting a
// 'collaborator' copy to 'owner' lives here, not just at the calling
// screen's render check. Mocks ../initialize (the raw expo-sqlite db
// object) since there's no test DB / migration harness in this project.
const mockRunAsync = jest.fn();
const mockGetFirstAsync = jest.fn();
jest.mock("../../initialize", () => ({
  db: {
    runAsync: (...args: unknown[]) => mockRunAsync(...args),
    getFirstAsync: (...args: unknown[]) => mockGetFirstAsync(...args),
  },
}));

import { setProjectCollaborative } from "../projects";
import type { Project } from "@/types/database";

const baseProject: Project = {
  id: 1,
  name: "Projeto Teste",
  protocol_id: "paisageo",
  protocol_source: "official",
  created_at: "2026-01-01T00:00:00.000Z",
  last_updated: "2026-01-01T00:00:00.000Z",
  is_classified: 0,
  collaboration_role: null,
  project_uuid: "project-uuid-1",
};

describe("setProjectCollaborative", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("promotes a project with collaboration_role null to 'owner'", async () => {
    mockGetFirstAsync.mockResolvedValue(baseProject);
    mockRunAsync.mockResolvedValue({ lastInsertRowId: 0 });

    const result = await setProjectCollaborative(1, "drive-folder-1");

    expect(result).toBe(true);
    expect(mockRunAsync).toHaveBeenCalledTimes(1);
    const [sql, params] = mockRunAsync.mock.calls[0];
    expect(sql).toContain("collaboration_role = 'owner'");
    expect(params).toEqual(["drive-folder-1", expect.any(String), 1]);
  });

  it("rejects a project already imported as a 'collaborator' copy with a clear error, without writing anything", async () => {
    mockGetFirstAsync.mockResolvedValue({ ...baseProject, collaboration_role: "collaborator" });

    await expect(setProjectCollaborative(1, "drive-folder-1")).rejects.toThrow(
      /nunca pode se tornar dono/,
    );
    expect(mockRunAsync).not.toHaveBeenCalled();
  });
});
