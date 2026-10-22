// The species catalog must never hold two species with the same scientific
// name in one project, whichever way they arrive (manual, GBIF, SpeciesLink,
// file, Drive restore, config package) and whichever way they are renamed.
// project-species.ts talks to expo-sqlite through the `db` singleton, which
// ts-jest (node) cannot run, so @/db/initialize is mocked with a small fake
// `db` that interprets the SQL these functions issue against in-memory rows
// (same approach as points-approval.test.ts).

interface SpeciesRow {
  id: number;
  project_id: number;
  scientific_name: string;
  gbif_id: string | null;
  uuid: string | null;
}
interface CommonNameRow {
  species_id: number;
  common_name: string;
  language: string;
}

let species: SpeciesRow[] = [];
let commonNames: CommonNameRow[] = [];
let nextId = 1;

const runAsyncMock = jest.fn(async (sql: string, params: unknown[]) => {
  if (sql.includes("INSERT INTO project_species_catalog")) {
    const [projectId, name, , , gbifId, , , , uuid] = params as [number, string, unknown, unknown, string | null, unknown, unknown, unknown, string | null];
    if (gbifId && species.some((s) => s.project_id === projectId && s.gbif_id === gbifId)) {
      throw new Error("UNIQUE constraint failed: project_species_catalog.project_id, project_species_catalog.gbif_id");
    }
    const row = { id: nextId++, project_id: projectId, scientific_name: name, gbif_id: gbifId ?? null, uuid: uuid ?? null };
    species.push(row);
    return { lastInsertRowId: row.id, changes: 1 };
  }
  if (sql.includes("INSERT INTO project_species_common_names") || sql.includes("INSERT OR IGNORE INTO project_species_common_names")) {
    const [speciesId, commonName, language] = params as [number, string, string];
    if (!commonNames.some((c) => c.species_id === speciesId && c.common_name === commonName && c.language === language)) {
      commonNames.push({ species_id: speciesId, common_name: commonName, language });
    }
    return { lastInsertRowId: commonNames.length, changes: 1 };
  }
  if (sql.startsWith("DELETE FROM project_species_common_names")) {
    commonNames = commonNames.filter((c) => c.species_id !== (params[0] as number));
    return { changes: 1 };
  }
  if (/^\s*UPDATE project_species_catalog/.test(sql)) {
    const columns = [...sql.matchAll(/(\w+) = \?/g)].map((m) => m[1]);
    const id = params[params.length - 1] as number;
    const row = species.find((s) => s.id === id)!;
    columns.slice(0, -0 || undefined).forEach((column, index) => {
      if (column === "scientific_name") row.scientific_name = params[index] as string;
    });
    return { changes: 1 };
  }
  return { lastInsertRowId: 0, changes: 0 };
});

const getAllAsyncMock = jest.fn(async (sql: string, params: unknown[]) => {
  if (sql.includes("SELECT id, scientific_name FROM project_species_catalog WHERE project_id")) {
    return species.filter((s) => s.project_id === params[0]).map((s) => ({ id: s.id, scientific_name: s.scientific_name }));
  }
  return [];
});

const getFirstAsyncMock = jest.fn(async (sql: string, params: unknown[]) => {
  if (sql.includes("SELECT project_id FROM project_species_catalog WHERE id")) {
    const row = species.find((s) => s.id === params[0]);
    return row ? { project_id: row.project_id } : null;
  }
  if (sql.includes("FROM project_species_catalog") && sql.includes("gbif_id = ?")) {
    const row = species.find((s) => s.project_id === params[0] && s.gbif_id === params[1]);
    return row ? { id: row.id } : null;
  }
  return null;
});

jest.mock("@/db/initialize", () => ({
  db: {
    runAsync: (...args: [string, unknown[]]) => runAsyncMock(...args),
    getAllAsync: (...args: [string, unknown[]]) => getAllAsyncMock(...args),
    getFirstAsync: (...args: [string, unknown[]]) => getFirstAsyncMock(...args),
  },
}));
jest.mock("@/core/utils/uuid", () => ({ generateUuid: () => "fake-uuid" }));

import {
  createProjectSpecies,
  importSpeciesFromCatalog,
  importSpeciesFromGBIF,
  importSpeciesFromSpeciesLink,
  updateProjectSpecies,
  updateProjectSpeciesWithCommonNames,
} from "../project-species";
import type { ProjectSpeciesCatalogInput } from "@/types/database";

/** Test shorthand: the catalog source defaults to "manual". */
const create = (
  data: Omit<ProjectSpeciesCatalogInput, "source"> & Partial<Pick<ProjectSpeciesCatalogInput, "source">>,
  index?: Parameters<typeof createProjectSpecies>[1],
) => createProjectSpecies({ source: "manual", ...data } as ProjectSpeciesCatalogInput, index);

const names = (projectId: number) => species.filter((s) => s.project_id === projectId).map((s) => s.scientific_name);

beforeEach(() => {
  species = [];
  commonNames = [];
  nextId = 1;
  jest.clearAllMocks();
});

describe("createProjectSpecies", () => {
  it("inserts a new species and returns its id", async () => {
    const result = await create({ project_id: 1, scientific_name: "Mimosa tenuiflora" });
    expect(result).toEqual({ status: "inserted", id: 1 });
    expect(names(1)).toEqual(["Mimosa tenuiflora"]);
  });

  it("blocks a second species with the same name and says which one already exists", async () => {
    await create({ project_id: 1, scientific_name: "Mimosa tenuiflora" });

    const result = await create({ project_id: 1, scientific_name: "Mimosa tenuiflora" });

    expect(result).toEqual({ status: "duplicate", existingId: 1 });
    expect(names(1)).toHaveLength(1);
  });

  it.each(["MIMOSA TENUIFLORA", "  mimosa   tenuiflora  ", "Mimosa tenuiflorá"])(
    "treats %p as the same name (case, spaces and accents)",
    async (variant) => {
      await create({ project_id: 1, scientific_name: "Mimosa tenuiflora" });
      expect(await create({ project_id: 1, scientific_name: variant })).toEqual({
        status: "duplicate",
        existingId: 1,
      });
    },
  );

  it("lets different names in", async () => {
    await create({ project_id: 1, scientific_name: "Mimosa tenuiflora" });
    const result = await create({ project_id: 1, scientific_name: "Mimosa hostilis" });
    expect(result).toEqual({ status: "inserted", id: 2 });
  });

  it("allows the same species in ANOTHER project", async () => {
    await create({ project_id: 1, scientific_name: "Mimosa tenuiflora" });
    const result = await create({ project_id: 2, scientific_name: "Mimosa tenuiflora" });
    expect(result.status).toBe("inserted");
  });

  it("does not insert anything (no common names, no uuid) when it is a duplicate", async () => {
    await create({ project_id: 1, scientific_name: "Mimosa tenuiflora" });
    runAsyncMock.mockClear();

    await create({
      project_id: 1,
      scientific_name: "mimosa tenuiflora",
      uuid: "remote-uuid",
      common_names: [{ common_name: "jurema", language: "pt", source: "manual" }],
    });

    expect(runAsyncMock).not.toHaveBeenCalled();
    expect(commonNames).toEqual([]);
  });

  it("reports an unexpected failure as an error, not as a duplicate or a bare null", async () => {
    runAsyncMock.mockRejectedValueOnce(new Error("disk full"));
    const result = await create({ project_id: 1, scientific_name: "Mimosa tenuiflora" });
    expect(result).toEqual({ status: "error", message: "disk full" });
  });

  it("reports a repeated GBIF record as a duplicate of the species that already has it", async () => {
    await create({ project_id: 1, scientific_name: "Mimosa tenuiflora", gbif_id: "g-1" });

    const result = await create({ project_id: 1, scientific_name: "Another name", gbif_id: "g-1" });

    expect(result).toEqual({ status: "duplicate", existingId: 1 });
  });

  it("uses a preloaded key index and keeps it up to date, without re-reading the table", async () => {
    const { loadSpeciesKeyIndex } = await import("../project-species");
    const index = await loadSpeciesKeyIndex(1);
    getAllAsyncMock.mockClear();

    expect((await create({ project_id: 1, scientific_name: "Mimosa tenuiflora" }, index)).status).toBe("inserted");
    expect((await create({ project_id: 1, scientific_name: "MIMOSA tenuiflora" }, index)).status).toBe("duplicate");
    expect(getAllAsyncMock).not.toHaveBeenCalled();
  });
});

describe("batch imports skip duplicates and count them", () => {
  const gbif = (scientificName: string, gbif_id?: string) => ({ scientificName, gbif_id, commonNames: [] });

  it("GBIF: inserts the new ones, ignores the repeated ones (also repeated inside the batch) and counts both", async () => {
    await create({ project_id: 1, scientific_name: "Mimosa tenuiflora" });

    const summary = await importSpeciesFromGBIF(1, [
      gbif("Mimosa tenuiflora"),
      gbif("Poincianella pyramidalis"),
      gbif("POINCIANELLA PYRAMIDALIS"),
      gbif("Anadenanthera colubrina"),
    ]);

    expect(summary).toEqual({ inserted: 2, duplicates: 2, failed: 0 });
    expect(names(1)).toEqual(["Mimosa tenuiflora", "Poincianella pyramidalis", "Anadenanthera colubrina"]);
  });

  it("GBIF: a failure is counted as failed, not as a duplicate", async () => {
    runAsyncMock.mockRejectedValueOnce(new Error("disk full"));
    const summary = await importSpeciesFromGBIF(1, [gbif("Mimosa tenuiflora"), gbif("Mimosa hostilis")]);
    expect(summary).toEqual({ inserted: 1, duplicates: 0, failed: 1 });
  });

  it("SpeciesLink: same rule", async () => {
    await create({ project_id: 1, scientific_name: "Mimosa tenuiflora" });
    const summary = await importSpeciesFromSpeciesLink(1, [
      { scientificName: "mimosa tenuiflora", commonNames: [] },
      { scientificName: "Mimosa hostilis", commonNames: [] },
    ]);
    expect(summary).toEqual({ inserted: 1, duplicates: 1, failed: 0 });
  });

  it("file: new species are inserted, an existing one gets its new common names merged, a blank name is a failure", async () => {
    await create({ project_id: 1, scientific_name: "Mimosa tenuiflora" });
    await create({ project_id: 1, scientific_name: "Mimosa hostilis" });

    const summary = await importSpeciesFromCatalog(1, [
      { scientific_name: "mimosa TENUIFLORA", source: "catalog", common_names: [{ common_name: "jurema-preta", language: "pt", source: "catalog" }] },
      { scientific_name: "Mimosa hostilis", source: "catalog", common_names: [] },
      { scientific_name: "Poincianella pyramidalis", source: "catalog", common_names: [] },
      { scientific_name: "   ", source: "catalog", common_names: [] },
    ]);

    expect(summary).toEqual({ inserted: 1, merged: 1, duplicates: 1, failed: 1 });
    expect(names(1)).toEqual(["Mimosa tenuiflora", "Mimosa hostilis", "Poincianella pyramidalis"]);
    expect(commonNames).toEqual([{ species_id: 1, common_name: "jurema-preta", language: "pt" }]);
  });

  it("the same names are accepted in another project", async () => {
    await importSpeciesFromGBIF(1, [gbif("Mimosa tenuiflora")]);
    const summary = await importSpeciesFromGBIF(2, [gbif("Mimosa tenuiflora")]);
    expect(summary).toEqual({ inserted: 1, duplicates: 0, failed: 0 });
  });
});

describe("renaming a species", () => {
  beforeEach(async () => {
    await create({ project_id: 1, scientific_name: "Mimosa tenuiflora" });
    await create({ project_id: 1, scientific_name: "Mimosa hostilis" });
    await create({ project_id: 2, scientific_name: "Poincianella pyramidalis" });
  });

  it("refuses a name another species of the project already has", async () => {
    const result = await updateProjectSpeciesWithCommonNames(2, { scientific_name: "MIMOSA tenuiflora" });
    expect(result).toEqual({ status: "duplicate", existingId: 1 });
    expect(species.find((s) => s.id === 2)!.scientific_name).toBe("Mimosa hostilis");
  });

  it("accepts keeping the species' own name (it does not collide with itself)", async () => {
    const result = await updateProjectSpeciesWithCommonNames(1, { scientific_name: "mimosa tenuiflora" });
    expect(result).toEqual({ status: "updated" });
  });

  it("accepts a name used only in another project", async () => {
    const result = await updateProjectSpeciesWithCommonNames(1, { scientific_name: "Poincianella pyramidalis" });
    expect(result).toEqual({ status: "updated" });
  });

  it("does not touch the common names when it refuses", async () => {
    commonNames.push({ species_id: 2, common_name: "keep me", language: "pt" });
    await updateProjectSpeciesWithCommonNames(2, {
      scientific_name: "Mimosa tenuiflora",
      common_names: [{ common_name: "new", language: "pt" }],
    });
    expect(commonNames).toEqual([{ species_id: 2, common_name: "keep me", language: "pt" }]);
  });

  it("updateProjectSpecies applies the same rule", async () => {
    expect(await updateProjectSpecies(2, { scientific_name: "Mimosa tenuiflora" })).toEqual({
      status: "duplicate",
      existingId: 1,
    });
  });

  it("an edit without a name change still works", async () => {
    expect(await updateProjectSpeciesWithCommonNames(1, { family: "Fabaceae" })).toEqual({ status: "updated" });
  });
});
