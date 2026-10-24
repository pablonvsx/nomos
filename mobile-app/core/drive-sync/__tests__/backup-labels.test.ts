import { failureHeading, failureName } from "../backup-labels";
import { buildProjectDataItems } from "../backup-items";
import type { ProjectConfigPackage } from "@/core/project-sharing/project-config-package";

// The same words the locale files carry, so the test reads like the screen.
const dictionary: Record<string, string> = {
  "surveyView.point": "Ponto",
  "driveBackup.item.unnamed.point": "Ponto sem nome",
  "driveBackup.item.unnamed.species": "Espécie sem nome",
  "driveBackup.item.unnamed.classification": "Classificação sem nome",
  "driveBackup.item.unnamed.protocol": "Protocolo sem nome",
  "driveBackup.item.unnamed.manifest": "Projeto sem nome",
};
const t = (key: string) => dictionary[key] ?? key;

describe("failureName", () => {
  it("names a point the way the point list does", () => {
    expect(failureName({ kind: "point", label: "", point: { number: 2, lat: -8.05, lon: -34.9 } }, t)).toBe("Ponto 2");
  });

  it("falls back to an unnamed point when the number is unusable, never a placeholder or an id", () => {
    const name = failureName({ kind: "point", label: "" }, t);
    expect(name).toBe("Ponto sem nome");
    expect(name).not.toContain("?");
  });

  it("uses the item's own name for the other kinds, or an unnamed fallback by kind", () => {
    expect(failureName({ kind: "species", label: "Aspidosperma" }, t)).toBe("Aspidosperma");
    expect(failureName({ kind: "classification", label: "  " }, t)).toBe("Classificação sem nome");
    expect(failureName({ kind: "species", label: "" }, t)).toBe("Espécie sem nome");
    expect(failureName({ kind: "protocol", label: "" }, t)).toBe("Protocolo sem nome");
    expect(failureName({ kind: "manifest", label: "" }, t)).toBe("Projeto sem nome");
  });
});

describe("failureHeading", () => {
  it("adds the coordinates (four decimals) to a point, to tell points apart", () => {
    expect(failureHeading({ kind: "point", label: "", point: { number: 2, lat: -8.05, lon: -34.9 } }, t)).toBe(
      "Ponto 2 (-8.0500, -34.9000)",
    );
  });

  it("is just the name for other kinds", () => {
    expect(failureHeading({ kind: "species", label: "Aspidosperma" }, t)).toBe("Aspidosperma");
  });
});

function pkg(overrides: Partial<ProjectConfigPackage> = {}): ProjectConfigPackage {
  return {
    format_version: 1,
    project_uuid: "p",
    project_name: "Campo",
    protocol_id: "x",
    protocol_source: "official",
    species_catalog: [{ uuid: "11111111-2222-4333-8444-555555555555", scientific_name: "", source: "manual", common_names: [] }],
    vegetation_classes: [{ uuid: "99999999-2222-4333-8444-555555555555", classes: [], created_at: "a", last_updated: "b" }],
    active_vegetation_classification: { type: "standard" },
    owner_email: "o@x.com",
    package_role_for_importer: "collaborator",
    ...overrides,
  } as unknown as ProjectConfigPackage;
}

describe("labels of the project-data items", () => {
  it("never fall back to a uuid or a placeholder: an item without a name has an empty label and the screen words it", () => {
    const { items } = buildProjectDataItems(pkg());
    for (const item of items) {
      expect(item.label).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
      expect(item.label).not.toContain("?");
    }
    const species = items.find((i) => i.kind === "species")!;
    const classification = items.find((i) => i.kind === "classification")!;
    expect(species.label).toBe("");
    expect(classification.label).toBe("");
    expect(failureName(species, t)).toBe("Espécie sem nome");
    expect(failureName(classification, t)).toBe("Classificação sem nome");
  });

  it("keep the readable names they have", () => {
    const { items } = buildProjectDataItems(
      pkg({
        species_catalog: [{ uuid: "s", scientific_name: "Aspidosperma", source: "manual", common_names: [] }],
        vegetation_classes: [{ uuid: "v", name: "Classif A", classes: [], created_at: "a", last_updated: "b" }],
      }),
    );
    expect(items.map((i) => i.label)).toEqual(["Classif A", "Aspidosperma", "Campo"]);
  });
});
