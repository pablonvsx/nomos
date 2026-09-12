// Proves COLLAB_MODEL_V2_REFERENCE.md section 10: the collaboration screen
// itself must never be gated behind a connected Google account - only the
// owner-specific "Tornar Projeto Colaborativo" action is. Renders the real
// component (via jest-expo + React Native Testing Library, see jest.config.js)
// with no Google account connected, for both project roles that reach the
// non-owner branch (null and 'collaborator'), and checks it renders its
// normal content instead of erroring or showing some Google-required gate.
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
const mockConfirm = jest.fn();
jest.mock("@/hooks/use-dialog", () => ({
  useAlertDialog: () => ({ alert: mockAlert, confirm: mockConfirm }),
}));

jest.mock("@/contexts/i18n-context", () => ({
  useI18n: () => ({ t: (key: string) => key, currentLanguage: "pt", setLanguage: jest.fn() }),
}));

const mockUseGoogleAccount = jest.fn();
jest.mock("@/hooks/use-google-account", () => ({
  useGoogleAccount: () => mockUseGoogleAccount(),
}));

// The real ProtocolKernelProvider/useProtocolRegistry transitively pulls in
// every module renderer, including components that open the real SQLite db
// at import time (db/initialize.ts) - unusable under jest-expo without a
// native database. registry is only ever passed through to the (also
// mocked) import/export handlers here, so a stub object is enough.
jest.mock("@/contexts/protocol-registry-context", () => ({
  useProtocolRegistry: () => ({}),
}));

const mockGetProjectById = jest.fn();
jest.mock("@/db/queries/projects", () => ({
  getProjectById: (...args: unknown[]) => mockGetProjectById(...args),
  setProjectCollaborative: jest.fn(),
}));

jest.mock("@/db/queries/points", () => ({
  getPointsByProject: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/core/drive-sync/project-drive-service", () => ({
  createCollaborativeProjectStructure: jest.fn(),
}));
jest.mock("@/core/drive-sync/point-submission-service", () => ({
  submitPointToProject: jest.fn(),
}));
jest.mock("@/core/drive-sync/backup-service", () => ({
  backupAllPendingPoints: jest.fn(),
}));
jest.mock("@/core/drive-sync/point-label", () => ({
  getPointDisplayLabel: jest.fn(() => ""),
}));
jest.mock("@/core/project-sharing/project-config-package", () => ({
  exportProjectConfigPackage: jest.fn(),
}));
jest.mock("@/core/project-sharing/import-points", () => ({
  importPointsPackage: jest.fn(),
}));
jest.mock("@/core/project-sharing/resolve-duplicates", () => ({
  resolvePointDuplicate: jest.fn(),
}));

import ProjectCollaborationScreen from "../project-collaboration/[id]";
import type { Project } from "@/types/database";

const baseProject: Project = {
  id: 1,
  name: "Projeto Fauna",
  protocol_id: "paisageo",
  protocol_source: "official",
  created_at: "2026-01-01T00:00:00.000Z",
  last_updated: "2026-01-01T00:00:00.000Z",
  is_classified: 0,
  collaboration_role: null,
  project_uuid: "project-uuid-1",
};

describe("ProjectCollaborationScreen without a connected Google account", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGoogleAccount.mockReturnValue({
      account: null,
      isConnecting: false,
      error: null,
      connect: jest.fn(),
      disconnect: jest.fn(),
    });
  });

  it("renders the 'make collaborative' action for a plain local project (collaboration_role: null)", async () => {
    mockGetProjectById.mockResolvedValue({ ...baseProject, collaboration_role: null });

    await render(
      <PaperProvider>
        <ProjectCollaborationScreen />
      </PaperProvider>,
    );

    expect(await screen.findByText("projectView.makeCollaborative")).toBeTruthy();
  });

  it("renders the collaborator-copy notice (no make-collaborative button) for collaboration_role: 'collaborator'", async () => {
    mockGetProjectById.mockResolvedValue({ ...baseProject, collaboration_role: "collaborator" });

    await render(
      <PaperProvider>
        <ProjectCollaborationScreen />
      </PaperProvider>,
    );

    expect(await screen.findByText("projectCollaboration.collaboratorCopyNotice")).toBeTruthy();
    expect(screen.queryByText("projectView.makeCollaborative")).toBeNull();
  });
});
