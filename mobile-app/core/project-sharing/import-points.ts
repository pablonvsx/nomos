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
import { parseJsonText } from "@/db/mappers/json-utils";
import { serializeModules } from "@/core/drive-sync/project-sync-service";
import { resolveCustomModuleDescriptors, forEachModuleMediaField } from "@/core/project-sharing/module-media";
import type { ProtocolRegistry, PointEnvelope } from "@/protocol-kernel/types";

export interface PendingDuplicate {
  pointId: string;
  pointLabel: string;
  /** Already carries persisted (Paths.document) media paths, same as a
   *  freshly-imported point - materializing media happens regardless of
   *  whether the point turns out to be a duplicate. */
  incomingEnvelope: PointEnvelope;
}

export interface ImportPointsResult {
  imported: number;
  rejected: Array<{ pointLabel: string; reason: string }>;
  duplicates: PendingDuplicate[];
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

function basename(uri: string): string {
  return uri.split("/").pop() ?? uri;
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
    return { imported: 0, rejected: [], duplicates: [] };
  }

  const extractDir = new Directory(Paths.cache, `points_import_${Date.now()}`);
  if (extractDir.exists) await extractDir.delete();
  await extractDir.create();

  try {
    const zipUri = picked.assets[0].uri;
    try {
      await unzip(zipUri.replace("file://", ""), extractDir.uri.replace("file://", ""));
    } catch {
      throw new Error("Este arquivo não é um pacote de pontos válido do Nomos.");
    }

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
        duplicates: [],
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
        duplicates: [],
      };
    }

    let imported = 0;
    const rejected: Array<{ pointLabel: string; reason: string }> = [];
    const duplicates: PendingDuplicate[] = [];
    const mediaRootDir = new Directory(extractDir, "media");
    const moduleDescriptors = await resolveCustomModuleDescriptors(project);

    for (const envelope of pkg.points) {
      try {
        const pointProtocolId =
          envelope.protocolId ??
          (project.protocol_source === "custom" ? "custom" : project.protocol_id);
        const pointMediaDir = new Directory(mediaRootDir, envelope.id);

        // Media is always materialized into persistent storage, whether or
        // not this point turns out to be a duplicate - the owner needs to
        // be able to see the incoming photos/audio to decide "Substituir" vs
        // "Descartar" either way (see resolve-duplicates.ts).
        const materializedPhotos = materializePhotos(envelope.photos ?? [], pointMediaDir, envelope.id);
        const materializedAudioNotes = materializeAudioNotes(
          envelope.audioNotes ?? [],
          pointMediaDir,
          envelope.id,
        );

        forEachModuleMediaField(envelope.modules ?? {}, moduleDescriptors, (loc) => {
          const items = parseJsonText<Array<Record<string, unknown>>>(loc.read() ?? "", [], Array.isArray);
          if (items.length === 0) return;

          const fieldMediaDir = new Directory(pointMediaDir, "module", loc.locatorKey);
          const materialized: Record<string, unknown>[] = [];
          items.forEach((item, index) => {
            const uri = typeof item.uri === "string" ? item.uri : null;
            if (!uri) return;
            const name = basename(uri);
            const sourceFile = new File(fieldMediaDir, name);
            if (!sourceFile.exists) return;
            const destFile = new File(
              Paths.document,
              `import_module_${envelope.id}_${loc.locatorKey}_${index}_${name}`,
            );
            sourceFile.copy(destFile);
            materialized.push({ ...item, uri: destFile.uri });
          });
          loc.write(JSON.stringify(materialized));
        });

        if (await pointExists(envelope.id)) {
          const incomingEnvelope: PointEnvelope = {
            ...envelope,
            protocolId: pointProtocolId,
            photos: materializedPhotos.map((p) => p.uri),
            audioNotes: materializedAudioNotes,
          };
          duplicates.push({
            pointId: envelope.id,
            pointLabel: `${pkg.collector_code}-${envelope.pointNumber ?? "?"}`,
            incomingEnvelope,
          });
          continue;
        }

        const photosJson = materializedPhotos.length > 0 ? JSON.stringify(materializedPhotos) : null;
        const audioNotesJson =
          materializedAudioNotes.length > 0 ? JSON.stringify(materializedAudioNotes) : null;
        const moduleData = serializeModules(envelope.modules ?? {}, pointProtocolId, registry);

        const newId = await createPoint({
          id: envelope.id,
          project_id: targetProjectId,
          protocol_id: pointProtocolId,
          lat: envelope.lat,
          lon: envelope.lon,
          altitude: envelope.altitude ?? null,
          generated_name: envelope.generatedName ?? null,
          photos: photosJson,
          audio_notes: audioNotesJson,
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

    return { imported, rejected, duplicates };
  } finally {
    if (extractDir.exists) await extractDir.delete();
  }
}

function materializePhotos(
  photoUris: string[],
  pointMediaDir: Directory,
  envelopeId: string,
): { uri: string; timestamp: number }[] {
  const materialized: { uri: string; timestamp: number }[] = [];
  photoUris.forEach((uri, index) => {
    const name = basename(uri);
    const sourceFile = new File(pointMediaDir, name);
    if (!sourceFile.exists) return;
    const destFile = new File(Paths.document, `import_${envelopeId}_${index}_${name}`);
    sourceFile.copy(destFile);
    materialized.push({ uri: destFile.uri, timestamp: Date.now() });
  });
  return materialized;
}

function materializeAudioNotes(
  audioNotes: NonNullable<PointEnvelope["audioNotes"]>,
  pointMediaDir: Directory,
  envelopeId: string,
): { uri: string; duration: number; timestamp: number }[] {
  const materialized: { uri: string; duration: number; timestamp: number }[] = [];
  audioNotes.forEach((note, index) => {
    const name = basename(note.uri);
    const sourceFile = new File(pointMediaDir, name);
    if (!sourceFile.exists) return;
    const destFile = new File(Paths.document, `import_audio_${envelopeId}_${index}_${name}`);
    sourceFile.copy(destFile);
    materialized.push({ uri: destFile.uri, duration: note.duration, timestamp: note.timestamp });
  });
  return materialized;
}
