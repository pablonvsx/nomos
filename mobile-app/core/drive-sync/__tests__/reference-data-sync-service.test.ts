jest.mock("@/utils/uuid", () => ({ generateUuid: jest.fn() }));
jest.mock("@/db/queries/projects", () => ({ getProjectById: jest.fn() }));
jest.mock("@/core/google-auth/google-auth-service", () => ({ getCurrentGoogleAccount: jest.fn() }));
jest.mock("../drive-api-client", () => ({
  listChildren: jest.fn(),
  uploadJsonFile: jest.fn(),
  readJsonFile: jest.fn(),
}));
jest.mock("../project-drive-service", () => ({ ensureFolder: jest.fn() }));
jest.mock("@/db/queries/vegetation-classifications", () => ({
  getVegetationClassificationsByProject: jest.fn(),
  createVegetationClassification: jest.fn(),
  setVegetationClassificationUuid: jest.fn(),
}));
jest.mock("@/db/queries/project-species", () => ({
  getProjectSpeciesCatalogByProject: jest.fn(),
  createProjectSpecies: jest.fn(),
  setProjectSpeciesUuid: jest.fn(),
  getProjectSpeciesIdByGbifId: jest.fn(),
}));

import { insertSpeciesFromRemote } from "../reference-data-sync-service";
import {
  createProjectSpecies,
  setProjectSpeciesUuid,
  getProjectSpeciesIdByGbifId,
} from "@/db/queries/project-species";

const mockCreateProjectSpecies = createProjectSpecies as jest.Mock;
const mockSetProjectSpeciesUuid = setProjectSpeciesUuid as jest.Mock;
const mockGetProjectSpeciesIdByGbifId = getProjectSpeciesIdByGbifId as jest.Mock;

describe("insertSpeciesFromRemote — gbif_id conflict reconciliation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("adopts the incoming uuid onto the existing local row when createProjectSpecies conflicts on gbif_id", async () => {
    // createProjectSpecies returns null on a UNIQUE(project_id, gbif_id)
    // violation - this simulates a species independently added on another
    // device before the first sync (same gbif_id, different uuid).
    mockCreateProjectSpecies.mockResolvedValue(null);
    mockGetProjectSpeciesIdByGbifId.mockResolvedValue(42);

    await insertSpeciesFromRemote(
      1,
      {
        scientific_name: "Handroanthus impetiginosus",
        gbif_id: "12345",
        source: "gbif",
        common_names: [],
      },
      "remote-uuid-999",
    );

    expect(mockGetProjectSpeciesIdByGbifId).toHaveBeenCalledWith(1, "12345");
    expect(mockSetProjectSpeciesUuid).toHaveBeenCalledWith(42, "remote-uuid-999");
  });

  it("does nothing extra when createProjectSpecies succeeds (no conflict)", async () => {
    mockCreateProjectSpecies.mockResolvedValue(7);

    await insertSpeciesFromRemote(
      1,
      { scientific_name: "Some species", gbif_id: "1", source: "gbif", common_names: [] },
      "uuid-1",
    );

    expect(mockGetProjectSpeciesIdByGbifId).not.toHaveBeenCalled();
    expect(mockSetProjectSpeciesUuid).not.toHaveBeenCalled();
  });

  it("does not try to reconcile when the payload has no gbif_id", async () => {
    mockCreateProjectSpecies.mockResolvedValue(null);

    await insertSpeciesFromRemote(
      1,
      { scientific_name: "Manual entry", source: "manual", common_names: [] },
      "uuid-2",
    );

    expect(mockGetProjectSpeciesIdByGbifId).not.toHaveBeenCalled();
    expect(mockSetProjectSpeciesUuid).not.toHaveBeenCalled();
  });
});
