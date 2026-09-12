// Exports one or more locally-collected points (with photos) as a .zip file
// that can be shared by any means and imported straight into the owner's
// device without Drive - see docs/12_COLLABORATION.md. Follows the same
// envelope + "photos as filenames, uploaded/copied separately" pattern
// already used by core/drive-sync/point-submission-service.ts, just copying
// into a zip instead of uploading to Drive.
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { zip } from "react-native-zip-archive";
import { getPoint } from "@/db/queries/points";
import { getProjectById } from "@/db/queries/projects";
import { getCustomProtocolById, setCustomProtocolUuid } from "@/db/queries/custom-protocols";
import { buildPointWithModules, buildPointEnvelope } from "@/db/mappers/point.mapper";
import { getLocalCollectorCode } from "@/core/local-identity/collector-code";
import { generateUuid } from "@/utils/uuid";
import type { ProtocolRegistry, PointEnvelope } from "@/protocol-kernel/types";

function basename(uri: string): string {
  return uri.split("/").pop() ?? uri;
}

export async function exportPointsPackage(
  pointIds: string[],
  registry: ProtocolRegistry,
): Promise<void> {
  if (pointIds.length === 0) {
    throw new Error("Nenhum ponto selecionado para exportar.");
  }

  const collectorCode = await getLocalCollectorCode();
  if (!collectorCode) {
    throw new Error(
      "Configure seu código de coletor em Configurações antes de exportar pontos.",
    );
  }

  const envelopes: PointEnvelope[] = [];
  let projectId: number | null = null;

  for (const pointId of pointIds) {
    const result = await getPoint(pointId);
    if (!result) {
      throw new Error("Ponto de coleta não encontrado.");
    }
    if (projectId === null) {
      projectId = result.point.project_id;
    }
    const pointWithModules = buildPointWithModules(result.point, result.modules, registry);
    envelopes.push(buildPointEnvelope(pointWithModules));
  }

  const project = await getProjectById(projectId as number);
  if (!project) {
    throw new Error("Projeto não encontrado.");
  }
  if (!project.project_uuid) {
    throw new Error(
      "Este projeto não tem uma configuração compartilhada vinculada. Importe o pacote de configuração do projeto antes de exportar pontos.",
    );
  }

  let customProtocolUuid: string | undefined;
  if (project.protocol_source === "custom") {
    const protocol = await getCustomProtocolById(Number(project.protocol_id));
    if (!protocol) {
      throw new Error("Protocolo personalizado deste projeto não encontrado.");
    }
    customProtocolUuid = protocol.uuid ?? undefined;
    if (!customProtocolUuid) {
      customProtocolUuid = generateUuid();
      await setCustomProtocolUuid(protocol.id, customProtocolUuid);
    }
  }

  const stagingDir = new Directory(Paths.cache, `points_export_${Date.now()}`);
  if (stagingDir.exists) await stagingDir.delete();
  await stagingDir.create();

  try {
    for (const envelope of envelopes) {
      const localPhotoUris = envelope.photos ?? [];
      if (localPhotoUris.length > 0) {
        const mediaDir = new Directory(stagingDir, "media", envelope.id);
        await mediaDir.create({ intermediates: true });
        for (const uri of localPhotoUris) {
          await new File(uri).copy(new File(mediaDir, basename(uri)));
        }
        envelope.photos = localPhotoUris.map(basename);
      }
    }

    const pkg = {
      format_version: 1 as const,
      project_uuid: project.project_uuid,
      protocol_id: project.protocol_id,
      protocol_source: project.protocol_source,
      custom_protocol_uuid: customProtocolUuid,
      collector_code: collectorCode,
      points: envelopes,
    };

    await new File(stagingDir, "points.json").write(JSON.stringify(pkg, null, 2));

    const zipFile = new File(Paths.cache, `Nomos_Pontos_${collectorCode}_${Date.now()}.zip`);
    await zip(stagingDir.uri.replace("file://", ""), zipFile.uri.replace("file://", ""));

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(zipFile.uri, { mimeType: "application/zip" });
    }
  } finally {
    if (stagingDir.exists) await stagingDir.delete();
  }
}
