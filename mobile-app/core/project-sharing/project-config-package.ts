// A "project config package" is a plain, portable .json file holding a
// project's protocol + species catalog + vegetation classes - no media, no
// points, no membership. It lets the owner share the setup of a project by
// any means (WhatsApp, e-mail, AirDrop...) so someone else can start
// collecting with the same protocol/catalog, without Google Drive or an
// invite flow. See docs/12_COLLABORATION.md for the broader single-owner
// export/import model this is the first phase of.
import * as DocumentPicker from "expo-document-picker";
import { writeAndShare } from "@/core/export/file-writer";
import { insertSpeciesFromRemote } from "@/core/drive-sync/reference-data-sync-service";
import {
  getProjectById,
  getProjectByUuid,
  setProjectUuid,
  createProjectFromPackage,
} from "@/db/queries/projects";
import {
  getCustomProtocolById,
  getCustomProtocolByUuid,
  createCustomProtocolFromPackage,
  setCustomProtocolUuid,
} from "@/db/queries/custom-protocols";
import {
  getProjectSpeciesCatalogByProject,
  setProjectSpeciesUuid,
} from "@/db/queries/project-species";
import {
  getVegetationClassificationsByProject,
  createVegetationClassification,
  setVegetationClassificationUuid,
  getActiveVegetationClassificationConfig,
  setActiveVegetationClassification,
} from "@/db/queries/vegetation-classifications";
import { generateUuid } from "@/utils/uuid";
import type { CustomProtocolSchema, VegetationClass } from "@/types/database";

export interface ProjectConfigPackage {
  format_version: 1;
  project_uuid: string;
  project_name: string;
  protocol_id: string;
  protocol_source: "official" | "custom";
  // Always "collaborator" - only an owner ever exports this package, and
  // importing it always produces a collaborator copy on the importing
  // device. Kept explicit in the wire format for forward-compatibility, but
  // applyProjectConfigPackage does not trust this value to decide local
  // state - it always creates the local project as 'collaborator'.
  package_role_for_importer: "collaborator";
  custom_protocol?: {
    uuid: string;
    name: string;
    theme: string;
    schema: CustomProtocolSchema;
  };
  species_catalog: Array<{
    uuid: string;
    scientific_name: string;
    source: string;
    common_names: unknown;
  }>;
  vegetation_classes: Array<{
    uuid: string;
    name: string;
    classes: VegetationClass[];
  }>;
  // Which vegetation classification the exporting project currently has
  // active - the vegetation_classes rows above always travel, but without
  // this the importing/restoring side has no way to know which one (if any)
  // to actually use, and silently falls back to the standard Nomos tree.
  active_vegetation_classification: {
    type: "standard" | "custom";
    custom_classification_uuid?: string;
  };
}

export async function buildProjectConfigPackage(
  projectId: number,
): Promise<ProjectConfigPackage> {
  const project = await getProjectById(projectId);
  if (!project) {
    throw new Error("Projeto não encontrado.");
  }

  let projectUuid = project.project_uuid;
  if (!projectUuid) {
    projectUuid = generateUuid();
    await setProjectUuid(project.id, projectUuid);
  }

  let customProtocol: ProjectConfigPackage["custom_protocol"];
  if (project.protocol_source === "custom") {
    const protocol = await getCustomProtocolById(Number(project.protocol_id));
    if (!protocol) {
      throw new Error("Protocolo personalizado deste projeto não encontrado.");
    }
    let protocolUuid = protocol.uuid;
    if (!protocolUuid) {
      protocolUuid = generateUuid();
      await setCustomProtocolUuid(protocol.id, protocolUuid);
    }
    customProtocol = {
      uuid: protocolUuid,
      name: protocol.name,
      theme: protocol.theme,
      schema: protocol.schema,
    };
  }

  const speciesRows = await getProjectSpeciesCatalogByProject(projectId);
  for (const row of speciesRows) {
    if (!row.uuid) {
      row.uuid = generateUuid();
      await setProjectSpeciesUuid(row.id, row.uuid);
    }
  }

  const vegRows = await getVegetationClassificationsByProject(projectId);
  for (const row of vegRows) {
    if (!row.uuid) {
      row.uuid = generateUuid();
      await setVegetationClassificationUuid(row.id, row.uuid);
    }
  }

  const activeVegetationConfig = await getActiveVegetationClassificationConfig(projectId);
  const activeVegetationRow =
    activeVegetationConfig?.type === "custom" && activeVegetationConfig.classificationId
      ? vegRows.find((row) => row.id === activeVegetationConfig.classificationId)
      : undefined;
  const activeVegetationClassification: ProjectConfigPackage["active_vegetation_classification"] =
    activeVegetationRow?.uuid
      ? { type: "custom", custom_classification_uuid: activeVegetationRow.uuid }
      : { type: "standard" };

  return {
    format_version: 1,
    project_uuid: projectUuid,
    project_name: project.name,
    protocol_id: project.protocol_id,
    protocol_source: project.protocol_source,
    package_role_for_importer: "collaborator",
    custom_protocol: customProtocol,
    species_catalog: speciesRows.map((row) => ({
      uuid: row.uuid as string,
      scientific_name: row.scientific_name,
      source: row.source,
      common_names: (row.common_names ?? []).map((cn) => ({
        common_name: cn.common_name,
        language: cn.language,
        source: cn.source,
      })),
    })),
    vegetation_classes: vegRows.map((row) => ({
      uuid: row.uuid as string,
      name: row.name,
      classes: row.classes,
    })),
    active_vegetation_classification: activeVegetationClassification,
  };
}

export async function applyProjectConfigPackage(
  pkg: ProjectConfigPackage,
): Promise<{ projectId: number; created: boolean }> {
  const existingProject = await getProjectByUuid(pkg.project_uuid);

  let projectId: number;
  let created: boolean;

  if (existingProject) {
    projectId = existingProject.id;
    created = false;
  } else {
    let localProtocolId = pkg.protocol_id;
    if (pkg.protocol_source === "custom") {
      if (!pkg.custom_protocol) {
        throw new Error("Pacote não contém o protocolo personalizado referenciado.");
      }
      const existingProtocol = await getCustomProtocolByUuid(pkg.custom_protocol.uuid);
      localProtocolId = String(
        existingProtocol
          ? existingProtocol.id
          : await createCustomProtocolFromPackage(pkg.custom_protocol),
      );
    }

    const newId = await createProjectFromPackage(
      pkg.project_uuid,
      pkg.project_name,
      localProtocolId,
      pkg.protocol_source,
      "collaborator",
    );
    if (!newId) {
      throw new Error("Não foi possível criar o projeto local.");
    }
    projectId = newId;
    created = true;
  }

  const existingSpecies = await getProjectSpeciesCatalogByProject(projectId);
  const existingSpeciesUuids = new Set(
    existingSpecies.map((row) => row.uuid).filter((uuid): uuid is string => !!uuid),
  );
  for (const item of pkg.species_catalog) {
    if (existingSpeciesUuids.has(item.uuid)) continue;
    await insertSpeciesFromRemote(projectId, item as unknown as Record<string, unknown>, item.uuid);
  }

  const existingVegetation = await getVegetationClassificationsByProject(projectId);
  const existingVegetationUuids = new Set(
    existingVegetation.map((row) => row.uuid).filter((uuid): uuid is string => !!uuid),
  );
  for (const item of pkg.vegetation_classes) {
    if (existingVegetationUuids.has(item.uuid)) continue;
    await createVegetationClassification(projectId, item.name, item.classes, item.uuid);
  }

  // The vegetation_classes rows above are only the raw catalog - without
  // resolving which one is actually active, this project would silently
  // fall back to the standard Nomos tree (see COLLAB_MODEL_V2_REFERENCE.md
  // section 9 audit follow-up). Re-fetch so the uuid lookup also covers rows
  // just created above, then resolve to the LOCAL id, same pattern already
  // used for custom_protocol.uuid.
  const activePkg = pkg.active_vegetation_classification;
  if (activePkg?.type === "custom" && activePkg.custom_classification_uuid) {
    const allVegetation = await getVegetationClassificationsByProject(projectId);
    const activeRow = allVegetation.find((row) => row.uuid === activePkg.custom_classification_uuid);
    if (activeRow) {
      await setActiveVegetationClassification(projectId, activeRow.id, "custom");
    }
  } else {
    await setActiveVegetationClassification(projectId, null, "standard");
  }

  return { projectId, created };
}

export async function exportProjectConfigPackage(projectId: number): Promise<void> {
  const pkg = await buildProjectConfigPackage(projectId);
  const safeName = pkg.project_name.replace(/[^a-z0-9]/gi, "_");
  await writeAndShare(
    `Nomos_Config_${safeName}.json`,
    JSON.stringify(pkg, null, 2),
    "application/json",
  );
}

function isValidProjectConfigPackage(value: unknown): value is ProjectConfigPackage {
  if (!value || typeof value !== "object") return false;
  const pkg = value as Record<string, unknown>;
  return (
    pkg.format_version === 1 &&
    typeof pkg.project_uuid === "string" &&
    typeof pkg.project_name === "string" &&
    typeof pkg.protocol_id === "string" &&
    (pkg.protocol_source === "official" || pkg.protocol_source === "custom") &&
    Array.isArray(pkg.species_catalog) &&
    Array.isArray(pkg.vegetation_classes)
  );
}

export async function importProjectConfigPackage(): Promise<
  { projectId: number; created: boolean } | null
> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/json", "*/*"],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    return null;
  }

  let content: string;
  try {
    const response = await fetch(result.assets[0].uri);
    content = await response.text();
  } catch (error) {
    console.error("Error reading project config package file:", error);
    throw new Error("Este arquivo não é um pacote de projeto válido do Nomos.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    console.error("Error parsing project config package file:", error);
    throw new Error("Este arquivo não é um pacote de projeto válido do Nomos.");
  }

  if (!isValidProjectConfigPackage(parsed)) {
    throw new Error("Este arquivo não é um pacote de projeto válido do Nomos.");
  }

  return applyProjectConfigPackage(parsed);
}
