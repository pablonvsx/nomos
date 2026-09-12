// Proves COLLAB_MODEL_V2_REFERENCE.md section 7: the rejected points area
// lists rejected points with their reason, and "Excluir permanentemente"
// reuses deletePoint (db/queries/points.ts) - the same function
// survey-point-details/[id].tsx already uses for its own delete action,
// per this phase's decision not to add a second, more thorough deletion
// path just for this screen. "Reconsiderar" moves a point back to pending.
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { PaperProvider } from "react-native-paper";

jest.mock("expo-router", () => {
  const ReactActual = require("react");
  return {
    useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
    useLocalSearchParams: () => ({ id: "1" }),
    useFocusEffect: (callback: () => void) => {
      ReactActual.useEffect(() => {
        callback();
      }, []);
    },
    Stack: { Screen: () => null },
  };
});

const mockAlert = jest.fn();
const mockConfirm = jest.fn();
jest.mock("@/hooks/use-dialog", () => ({
  useAlertDialog: () => ({ alert: mockAlert, confirm: mockConfirm }),
}));

jest.mock("@/contexts/i18n-context", () => ({
  useI18n: () => ({ t: (key: string) => key, currentLanguage: "pt", setLanguage: jest.fn() }),
}));

const mockGetProjectById = jest.fn();
jest.mock("@/db/queries/projects", () => ({
  getProjectById: (...args: unknown[]) => mockGetProjectById(...args),
}));

const mockGetRejectedPointsByProject = jest.fn();
const mockUpdatePointApprovalStatus = jest.fn();
const mockDeletePoint = jest.fn();
jest.mock("@/db/queries/points", () => ({
  getRejectedPointsByProject: (...args: unknown[]) => mockGetRejectedPointsByProject(...args),
  updatePointApprovalStatus: (...args: unknown[]) => mockUpdatePointApprovalStatus(...args),
  deletePoint: (...args: unknown[]) => mockDeletePoint(...args),
}));

import ProjectRejectedScreen from "../project-rejected/[id]";
import type { Project, Point } from "@/types/database";

const project: Project = {
  id: 1,
  name: "Projeto Fauna",
  protocol_id: "paisageo",
  protocol_source: "official",
  created_at: "2026-01-01T00:00:00.000Z",
  last_updated: "2026-01-01T00:00:00.000Z",
  is_classified: 0,
  collaboration_role: "owner",
  project_uuid: "project-uuid-1",
};

const rejectedPoint: Point = {
  id: "point-1",
  project_id: 1,
  protocol_id: "paisageo",
  point_number: 1,
  lat: -8.05,
  lon: -34.9,
  altitude: null,
  generated_name: "Ponto 1",
  landscape_class_id: null,
  photos: null,
  audio_notes: null,
  additional_notes: null,
  point_size: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  created_by: "PS01",
  approval_status: "rejected",
  rejection_reason: "Fora da área do projeto",
  drive_synced_at: null,
};

describe("ProjectRejectedScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetProjectById.mockResolvedValue(project);
    mockGetRejectedPointsByProject.mockResolvedValue([rejectedPoint]);
    mockDeletePoint.mockResolvedValue(true);
    mockUpdatePointApprovalStatus.mockResolvedValue(true);
  });

  it("lists rejected points with their rejection reason", async () => {
    await render(
      <PaperProvider>
        <ProjectRejectedScreen />
      </PaperProvider>,
    );

    expect(await screen.findByText("Ponto 1")).toBeTruthy();
    expect(screen.getByText(/Fora da área do projeto/)).toBeTruthy();
    expect(mockGetRejectedPointsByProject).toHaveBeenCalledWith(project.id);
  });

  it("permanently deletes a rejected point via the existing deletePoint function", async () => {
    await render(
      <PaperProvider>
        <ProjectRejectedScreen />
      </PaperProvider>,
    );

    await screen.findByText("Ponto 1");
    fireEvent.press(screen.getByText("projectRejected.deletePermanently"));

    // confirm() is mocked as a plain jest.fn() (not a rendered dialog) -
    // invoke the captured onConfirm callback directly, same trick as
    // resolve-duplicates.test.ts uses for its mocked confirm-style calls.
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    const onConfirm = mockConfirm.mock.calls[0][2];
    await onConfirm();

    expect(mockDeletePoint).toHaveBeenCalledWith("point-1");
    await waitFor(() => expect(screen.queryByText("Ponto 1")).toBeNull());
  });

  it("reconsiders a rejected point back to pending without any confirmation dialog", async () => {
    await render(
      <PaperProvider>
        <ProjectRejectedScreen />
      </PaperProvider>,
    );

    await screen.findByText("Ponto 1");
    fireEvent.press(screen.getByText("projectRejected.reconsider"));

    await waitFor(() => expect(mockUpdatePointApprovalStatus).toHaveBeenCalledWith("point-1", "pending"));
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("shows the empty state when there are no rejected points", async () => {
    mockGetRejectedPointsByProject.mockResolvedValue([]);

    await render(
      <PaperProvider>
        <ProjectRejectedScreen />
      </PaperProvider>,
    );

    expect(await screen.findByText("projectRejected.empty")).toBeTruthy();
  });
});
