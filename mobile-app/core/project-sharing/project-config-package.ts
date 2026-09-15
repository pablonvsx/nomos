import * as DocumentPicker from "expo-document-picker";
import {
  createProject,
  ensureProjectUuid,
  getProjectById,
  getProjectByUuid,
} from "@/db/queries/projects";
import {
  createCustomProtocolWithUuid,
  ensureCustomProtocolUuid,
  getCustomProtocolById,
  getCustomProtocolByUuid,
} from "@/db/queries/custom-protocols";
import {
  createProjectSpecies,
  getAllProjectSpeciesCatalogEnsuringUuids,
  getProjectSpeciesByUuid,
} from "@/db/queries/project-species";
import {
  createVegetationClassification,
  getActiveVegetationClassificationConfig,
  getAllVegetationClassificationsEnsuringUuids,
  getVegetationClassificationByUuid,
  setActiveVegetationClassification,
  setVegetationClassificationUuid,
} from "@/db/queries/vegetation-classifications";
import { writeAndShare } from "@/core/export/file-writer";
import { CustomProtocolSchema, VegetationClass } from "@/types/database";
import { InvalidPackageError, UnsupportedPackageVersionError } from "@/core/project-sharing/package-errors";

export { InvalidPackageError, UnsupportedPackageVersionError };

export const CONFIG_PACKAGE_FORMAT_VERSION = 1;

export interface ProjectConfigPackage {
  format_version: 1;
  project_uuid: string;
  project_name: string;
  protocol_id: string;
  protocol_source: "official" | "custom";
  custom_protocol?: { uuid: string; name: string; theme: string; schema: unknown };
  species_catalog: Array<{
    uuid: string;
    scientific_name: string;
    source: string;
    common_names: unknown;
  }>;
  vegetation_classes: Array<Record<string, unknown> & { uuid: string }>;
  active_vegetation_classification: {
    type: "standard" | "custom";
    custom_classification_uuid?: string;
  };
  owner_email: string | null;
}

export async function buildProjectConfigPackage(
  projectId: number,
): Promise<ProjectConfigPackage> {
  const project = await getProjectById(projectId);
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  const projectUuid = await ensureProjectUuid(projectId);

  let customProtocol: ProjectConfigPackage["custom_protocol"];
  if (project.protocol_source === "custom") {
    const customProtocolId = parseInt(project.protocol_id, 10);
    const protocol = await getCustomProtocolById(customProtocolId);
    if (!protocol) {
      throw new Error(
        `Custom protocol ${project.protocol_id} referenced by project ${projectId} not found`,
      );
    }
    const uuid = await ensureCustomProtocolUuid(customProtocolId);
    customProtocol = {
      uuid,
      name: protocol.name,
      theme: protocol.theme,
      schema: protocol.schema,
    };
  }

  const speciesRows = await getAllProjectSpeciesCatalogEnsuringUuids(projectId);
  const speciesCatalog = speciesRows.map((species) => ({
    uuid: species.uuid as string,
    scientific_name: species.scientific_name,
    source: species.source,
    common_names: species.common_names ?? [],
  }));

  const vegetationRows = await getAllVegetationClassificationsEnsuringUuids(projectId);
  const vegetationClasses = vegetationRows.map((classification) => ({
    uuid: classification.uuid as string,
    name: classification.name,
    classes: classification.classes,
    created_at: classification.created_at,
    last_updated: classification.last_updated,
  }));

  const activeConfig = await getActiveVegetationClassificationConfig(projectId);
  let activeVegetationClassification: ProjectConfigPackage["active_vegetation_classification"];
  if (activeConfig?.type === "custom" && activeConfig.classificationId) {
    const activeUuid = await ensureVegetationClassificationUuidById(
      vegetationRows,
      activeConfig.classificationId,
    );
    activeVegetationClassification = {
      type: "custom",
      custom_classification_uuid: activeUuid,
    };
  } else {
    activeVegetationClassification = { type: "standard" };
  }

  return {
    format_version: CONFIG_PACKAGE_FORMAT_VERSION,
    project_uuid: projectUuid,
    project_name: project.name,
    protocol_id: project.protocol_id,
    protocol_source: project.protocol_source,
    custom_protocol: customProtocol,
    species_catalog: speciesCatalog,
    vegetation_classes: vegetationClasses,
    active_vegetation_classification: activeVegetationClassification,
    owner_email: project.owner_email ?? null,
  };
}

function ensureVegetationClassificationUuidById(
  rows: Array<{ id: number; uuid?: string | null }>,
  classificationId: number,
): string {
  const match = rows.find((row) => row.id === classificationId);
  if (!match?.uuid) {
    throw new Error(
      `Active vegetation classification ${classificationId} is missing a uuid`,
    );
  }
  return match.uuid;
}

function assertValidPackageShape(
  pkg: unknown,
): asserts pkg is ProjectConfigPackage {
  if (!pkg || typeof pkg !== "object") {
    throw new InvalidPackageError("Arquivo inválido: não é um pacote de configuração válido.");
  }

  // format_version must be checked before reading any other field.
  const version = (pkg as { format_version?: unknown }).format_version;
  if (version !== CONFIG_PACKAGE_FORMAT_VERSION) {
    throw new UnsupportedPackageVersionError();
  }

  const candidate = pkg as Partial<ProjectConfigPackage>;
  if (typeof candidate.project_uuid !== "string" || !candidate.project_uuid) {
    throw new InvalidPackageError("Arquivo inválido: project_uuid ausente.");
  }
  if (typeof candidate.project_name !== "string" || !candidate.project_name) {
    throw new InvalidPackageError("Arquivo inválido: project_name ausente.");
  }
  if (typeof candidate.protocol_id !== "string" || !candidate.protocol_id) {
    throw new InvalidPackageError("Arquivo inválido: protocol_id ausente.");
  }
  if (
    candidate.protocol_source !== "official" &&
    candidate.protocol_source !== "custom"
  ) {
    throw new InvalidPackageError("Arquivo inválido: protocol_source inválido.");
  }
  if (candidate.protocol_source === "custom" && !candidate.custom_protocol) {
    throw new InvalidPackageError(
      "Arquivo inválido: protocol_source é 'custom' mas custom_protocol está ausente.",
    );
  }
  if (!Array.isArray(candidate.species_catalog)) {
    throw new InvalidPackageError("Arquivo inválido: species_catalog ausente.");
  }
  if (!Array.isArray(candidate.vegetation_classes)) {
    throw new InvalidPackageError("Arquivo inválido: vegetation_classes ausente.");
  }
  if (!candidate.active_vegetation_classification) {
    throw new InvalidPackageError(
      "Arquivo inválido: active_vegetation_classification ausente.",
    );
  }
}

export async function applyProjectConfigPackage(
  pkg: unknown,
): Promise<{ projectId: number; created: boolean }> {
  assertValidPackageShape(pkg);

  const existingProject = await getProjectByUuid(pkg.project_uuid);
  let projectId: number;
  let created: boolean;

  if (existingProject) {
    projectId = existingProject.id;
    created = false;
  } else {
    let localProtocolId = pkg.protocol_id;

    if (pkg.protocol_source === "custom" && pkg.custom_protocol) {
      const existingCustomProtocol = await getCustomProtocolByUuid(
        pkg.custom_protocol.uuid,
      );
      if (existingCustomProtocol) {
        localProtocolId = String(existingCustomProtocol.id);
      } else {
        const newId = await createCustomProtocolWithUuid(
          pkg.custom_protocol.name,
          pkg.custom_protocol.schema as CustomProtocolSchema,
          pkg.custom_protocol.theme,
          pkg.custom_protocol.uuid,
        );
        localProtocolId = String(newId);
      }
    }

    const newProjectId = await createProject(
      pkg.project_name,
      localProtocolId,
      "",
      pkg.protocol_source,
      pkg.project_uuid,
      pkg.owner_email,
    );
    if (!newProjectId) {
      throw new Error("Failed to create local project while importing configuration package");
    }
    projectId = newProjectId;
    created = true;
  }

  for (const speciesEntry of pkg.species_catalog) {
    const existingSpecies = await getProjectSpeciesByUuid(projectId, speciesEntry.uuid);
    if (existingSpecies) continue;

    await createProjectSpecies({
      project_id: projectId,
      scientific_name: speciesEntry.scientific_name,
      source: sanitizeSpeciesSource(speciesEntry.source),
      uuid: speciesEntry.uuid,
      common_names: parseImportedCommonNames(speciesEntry.common_names),
    });
  }

  const localVegetationIdByUuid = new Map<string, number>();
  for (const vegEntry of pkg.vegetation_classes) {
    const existingVeg = await getVegetationClassificationByUuid(projectId, vegEntry.uuid);
    if (existingVeg) {
      localVegetationIdByUuid.set(vegEntry.uuid, existingVeg.id);
      continue;
    }

    const newId = await createVegetationClassification(
      projectId,
      vegEntry.name as string,
      vegEntry.classes as VegetationClass[],
    );
    if (!newId) continue;
    await setVegetationClassificationUuid(newId, vegEntry.uuid);
    localVegetationIdByUuid.set(vegEntry.uuid, newId);
  }

  if (pkg.active_vegetation_classification.type === "custom") {
    const targetUuid = pkg.active_vegetation_classification.custom_classification_uuid;
    const localId = targetUuid ? localVegetationIdByUuid.get(targetUuid) : undefined;
    if (localId) {
      await setActiveVegetationClassification(projectId, localId, "custom");
    }
  } else {
    await setActiveVegetationClassification(projectId, null, "standard");
  }

  return { projectId, created };
}

function parseImportedCommonNames(value: unknown): Array<{
  common_name: string;
  language: string;
  source: "gbif" | "manual" | "specieslink" | "catalog";
}> {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (entry): entry is Record<string, unknown> =>
        !!entry && typeof entry === "object" && typeof entry.common_name === "string",
    )
    .map((entry) => ({
      common_name: entry.common_name as string,
      language: typeof entry.language === "string" ? entry.language : "pt",
      source: sanitizeSpeciesSource(
        typeof entry.source === "string" ? entry.source : "manual",
      ),
    }));
}

function sanitizeSpeciesSource(
  value: string,
): "gbif" | "manual" | "specieslink" | "catalog" {
  const validSources = ["gbif", "manual", "specieslink", "catalog"];
  return validSources.includes(value)
    ? (value as "gbif" | "manual" | "specieslink" | "catalog")
    : "catalog";
}

function sanitizeFileNamePart(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "_");
}

export async function exportProjectConfigPackage(projectId: number): Promise<void> {
  const pkg = await buildProjectConfigPackage(projectId);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
  const fileName = `Nomos_Config_${sanitizeFileNamePart(pkg.project_name)}_${timestamp}.json`;

  await writeAndShare(fileName, JSON.stringify(pkg, null, 2), "application/json");
}

/**
 * Picks a JSON file via the system document picker and imports it as a
 * project configuration package. The picked file's content is read into
 * memory and parsed here; every field that matters ends up in SQLite via
 * applyProjectConfigPackage, so the picker's (possibly transient,
 * possibly content:// scoped) uri never needs to be persisted anywhere.
 */
export async function importProjectConfigPackage(): Promise<{
  projectId: number;
  created: boolean;
} | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "text/plain", "*/*"],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  const response = await fetch(result.assets[0].uri);
  const content = await response.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new InvalidPackageError(
      "Arquivo inválido. Selecione um pacote de configuração de projeto (.json) exportado pelo Nomos.",
    );
  }

  return applyProjectConfigPackage(parsed);
}
