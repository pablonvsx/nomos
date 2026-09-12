// Resolves a PendingDuplicate returned by importPointsPackage
// (core/project-sharing/import-points.ts) once the owner decides what to do
// with a point whose id already existed locally. The incoming media was
// already materialized into persistent storage at import time regardless of
// the duplicate outcome - this only decides whether that data lands in the
// database ('replace') or gets cleaned up as orphaned storage ('discard').
import { File } from "expo-file-system";
import { updatePoint } from "@/db/queries/points";
import { serializeModules } from "@/core/drive-sync/project-sync-service";
import { resolveCustomModuleDescriptors, forEachModuleMediaField } from "@/core/project-sharing/module-media";
import { parseJsonText } from "@/db/mappers/json-utils";
import type { PendingDuplicate } from "@/core/project-sharing/import-points";
import type { Project } from "@/types/database";
import type { ProtocolRegistry } from "@/protocol-kernel/types";

export async function resolvePointDuplicate(
  duplicate: PendingDuplicate,
  action: "replace" | "discard",
  project: Project,
  registry: ProtocolRegistry,
): Promise<void> {
  const envelope = duplicate.incomingEnvelope;

  if (action === "discard") {
    for (const uri of envelope.photos ?? []) {
      const file = new File(uri);
      if (file.exists) file.delete();
    }
    for (const note of envelope.audioNotes ?? []) {
      const file = new File(note.uri);
      if (file.exists) file.delete();
    }

    const moduleDescriptors = await resolveCustomModuleDescriptors(project);
    forEachModuleMediaField(envelope.modules ?? {}, moduleDescriptors, (loc) => {
      const items = parseJsonText<Array<Record<string, unknown>>>(loc.read() ?? "", [], Array.isArray);
      for (const item of items) {
        const uri = typeof item.uri === "string" ? item.uri : null;
        if (!uri) continue;
        const file = new File(uri);
        if (file.exists) file.delete();
      }
    });
    return;
  }

  const pointProtocolId =
    envelope.protocolId ?? (project.protocol_source === "custom" ? "custom" : project.protocol_id);
  const moduleData = serializeModules(envelope.modules ?? {}, pointProtocolId, registry);

  await updatePoint(duplicate.pointId, {
    lat: envelope.lat,
    lon: envelope.lon,
    altitude: envelope.altitude ?? null,
    generated_name: envelope.generatedName ?? null,
    photos:
      envelope.photos && envelope.photos.length > 0
        ? JSON.stringify(envelope.photos.map((uri) => ({ uri, timestamp: Date.now() })))
        : null,
    audio_notes:
      envelope.audioNotes && envelope.audioNotes.length > 0 ? JSON.stringify(envelope.audioNotes) : null,
    additional_notes: JSON.stringify(envelope.additionalNotes ?? []),
    point_size: envelope.pointSize ?? null,
    schema_version: "1.0.0",
    modules: moduleData,
    approval_status: "pending",
  });
}
