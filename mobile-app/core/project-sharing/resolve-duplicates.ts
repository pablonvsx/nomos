// Resolves a PendingDuplicate returned by importPointsPackage
// (core/project-sharing/import-points.ts) once the owner decides what to do
// with a point whose id already existed locally. The incoming media was
// already materialized into persistent storage at import time regardless of
// the duplicate outcome - this only decides whether that data lands in the
// database ('replace') or gets cleaned up as orphaned storage ('discard').
import { updatePoint } from "@/db/queries/points";
import { serializeModules } from "@/core/drive-sync/project-sync-service";
import { deletePointEnvelopeMediaFiles } from "@/core/project-sharing/module-media";
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
    await deletePointEnvelopeMediaFiles(envelope, project);
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
