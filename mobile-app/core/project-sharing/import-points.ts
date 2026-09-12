// Imports a .zip package of points (produced by exportPointsPackage) into a
// local project, without any Drive/Google account involved. Mirrors the
// "insert a point coming from outside, preserving its id" pattern already
// used by core/drive-sync/project-sync-service.ts when pulling approved
// points from Drive.
import * as DocumentPicker from "expo-document-picker";
import { Directory, File, Paths } from "expo-file-system";
import { unzip } from "react-native-zip-archive";
import { getProjectById } from "@/db/queries/projects";
import { getCustomProtocolById } from "@/db/queries/custom-protocols";
import { createPoint, pointExists } from "@/db/queries/points";
import { serializeModules } from "@/core/drive-sync/project-sync-service";
import type { ProtocolRegistry, PointEnvelope } from "@/protocol-kernel/types";

export interface ImportPointsResult {
  imported: number;
  rejected: Array<{ pointLabel: string; reason: string }>;
}

interface PointsPackage {
  format_version: 1;
  project_uuid: string;
  protocol_id: string;
  protocol_source: "official" | "custom";
  custom_protocol_uuid?: string;
  collector_code: string;
  points: PointEnvelope[];
}

function isValidPointsPackage(value: unknown): value is PointsPackage {
  if (!value || typeof value !== "object") return false;
  const pkg = value as Record<string, unknown>;
  return (
    pkg.format_version === 1 &&
    typeof pkg.project_uuid === "string" &&
    typeof pkg.protocol_id === "string" &&
    (pkg.protocol_source === "official" || pkg.protocol_source === "custom") &&
    typeof pkg.collector_code === "string" &&
    Array.isArray(pkg.points)
  );
}

function pointLabel(envelope: PointEnvelope): string {
  return envelope.generatedName || `Ponto ${envelope.pointNumber ?? "?"}`;
}

export async function importPointsPackage(
  targetProjectId: number,
  registry: ProtocolRegistry,
): Promise<ImportPointsResult> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: ["application/zip", "*/*"],
    copyToCacheDirectory: true,
  });

  if (picked.canceled || !picked.assets || picked.assets.length === 0) {
    return { imported: 0, rejected: [] };
  }

  const extractDir = new Directory(Paths.cache, `points_import_${Date.now()}`);
  if (extractDir.exists) await extractDir.delete();
  await extractDir.create();

  try {
    const zipUri = picked.assets[0].uri;
    await unzip(zipUri.replace("file://", ""), extractDir.uri.replace("file://", ""));

    const pointsJsonFile = new File(extractDir, "points.json");
    if (!pointsJsonFile.exists) {
      throw new Error("Este arquivo não é um pacote de pontos válido do Nomos.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(await pointsJsonFile.text());
    } catch {
      throw new Error("Este arquivo não é um pacote de pontos válido do Nomos.");
    }

    if (!isValidPointsPackage(parsed)) {
      throw new Error("Este arquivo não é um pacote de pontos válido do Nomos.");
    }
    const pkg = parsed;

    const project = await getProjectById(targetProjectId);
    if (!project) {
      throw new Error("Projeto de destino não encontrado.");
    }

    if (project.project_uuid !== pkg.project_uuid) {
      return {
        imported: 0,
        rejected: pkg.points.map((p) => ({
          pointLabel: pointLabel(p),
          reason: "Este arquivo pertence a outro projeto.",
        })),
      };
    }

    let protocolMatches: boolean;
    if (pkg.protocol_source === "official") {
      protocolMatches =
        project.protocol_source === "official" && project.protocol_id === pkg.protocol_id;
    } else {
      const localProtocol =
        project.protocol_source === "custom"
          ? await getCustomProtocolById(Number(project.protocol_id))
          : null;
      protocolMatches = !!localProtocol && localProtocol.uuid === pkg.custom_protocol_uuid;
    }

    if (!protocolMatches) {
      return {
        imported: 0,
        rejected: pkg.points.map((p) => ({
          pointLabel: pointLabel(p),
          reason: "Este arquivo foi coletado com um protocolo diferente do usado neste projeto.",
        })),
      };
    }

    let imported = 0;
    const rejected: Array<{ pointLabel: string; reason: string }> = [];
    const mediaRootDir = new Directory(extractDir, "media");

    for (const envelope of pkg.points) {
      if (await pointExists(envelope.id)) {
        continue; // already imported before - silent dedupe, not counted either way
      }

      try {
        const moduleData = serializeModules(envelope.modules ?? {}, project.protocol_id, registry);

        let photosJson: string | null = null;
        const photoNames = envelope.photos ?? [];
        if (photoNames.length > 0) {
          const pointMediaDir = new Directory(mediaRootDir, envelope.id);
          const materialized: { uri: string; timestamp: number }[] = [];
          photoNames.forEach((name, index) => {
            const sourceFile = new File(pointMediaDir, name);
            if (!sourceFile.exists) return;
            const destFile = new File(Paths.document, `import_${envelope.id}_${index}_${name}`);
            sourceFile.copy(destFile);
            materialized.push({ uri: destFile.uri, timestamp: Date.now() });
          });
          photosJson = JSON.stringify(materialized);
        }

        const newId = await createPoint({
          id: envelope.id,
          project_id: targetProjectId,
          protocol_id: project.protocol_id,
          lat: envelope.lat,
          lon: envelope.lon,
          altitude: envelope.altitude ?? null,
          generated_name: envelope.generatedName ?? null,
          photos: photosJson,
          additional_notes: JSON.stringify(envelope.additionalNotes ?? []),
          point_size: envelope.pointSize ?? null,
          schema_version: "1.0.0",
          modules: moduleData,
          approval_status: "pending",
          created_by: pkg.collector_code,
        });

        if (newId) {
          imported++;
        } else {
          rejected.push({ pointLabel: pointLabel(envelope), reason: "Falha ao gravar o ponto localmente." });
        }
      } catch (error) {
        console.error("Error importing point from package:", error);
        rejected.push({ pointLabel: pointLabel(envelope), reason: "Falha ao gravar o ponto localmente." });
      }
    }

    return { imported, rejected };
  } finally {
    if (extractDir.exists) await extractDir.delete();
  }
}
