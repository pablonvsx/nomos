// Proves COLLAB_MODEL_V2_REFERENCE.md sections 6/10/13: the local approval
// queue must load and render pending points using pure local SQL, with zero
// Google/Drive dependency, direct or indirect (no submitPointToProject call
// on approve anymore - see the header comment in project-approvals/[id].tsx).
// Deliberately does NOT mock @/hooks/use-google-account or any
// @/core/drive-sync/* module - if the screen still imported any of those,
// this test file would fail to resolve them and the suite would error out.
import React from "react";
import { render, screen } from "@testing-library/react-native";
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
jest.mock("@/hooks/use-dialog", () => ({
  useAlertDialog: () => ({ alert: mockAlert, confirm: jest.fn() }),
}));

jest.mock("@/contexts/i18n-context", () => ({
  useI18n: () => ({ t: (key: string) => key, currentLanguage: "pt", setLanguage: jest.fn() }),
}));

const mockGetProjectById = jest.fn();
jest.mock("@/db/queries/projects", () => ({
  getProjectById: (...args: unknown[]) => mockGetProjectById(...args),
}));

const mockGetPendingPointsByProject = jest.fn();
jest.mock("@/db/queries/points", () => ({
  getPendingPointsByProject: (...args: unknown[]) => mockGetPendingPointsByProject(...args),
  updatePointApprovalStatus: jest.fn(),
}));

import ProjectApprovalsScreen from "../project-approvals/[id]";
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

const pendingPoint: Point = {
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
  approval_status: "pending",
  rejection_reason: null,
  drive_synced_at: null,
};

describe("ProjectApprovalsScreen without any Google account setup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetProjectById.mockResolvedValue(project);
    mockGetPendingPointsByProject.mockResolvedValue([pendingPoint]);
  });

  it("loads and renders local pending points with no Google/Drive dependency", async () => {
    await render(
      <PaperProvider>
        <ProjectApprovalsScreen />
      </PaperProvider>,
    );

    expect(await screen.findByText("Ponto 1")).toBeTruthy();
    expect(mockGetPendingPointsByProject).toHaveBeenCalledWith(project.id);
  });
});
