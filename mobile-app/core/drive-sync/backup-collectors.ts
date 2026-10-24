// Reads the project's current state from SQLite and the file system and
// builds the backup items (see backup-items.ts for what goes into them).
// Everything here is local: no network, so it also works offline.

import { File } from "expo-file-system";
import {
  buildPointItems,
  buildProjectDataItems,
  type ProjectDataItems,
} from "@/core/drive-sync/backup-items";
import type { BackupItem } from "@/core/drive-sync/change-detection";
import { getModuleMediaFields, mapModuleMediaUris } from "@/core/project-sharing/module-media";
import { buildProjectConfigPackage } from "@/core/project-sharing/project-config-package";
import { getBackupCandidatePointsByProject, getPointModulesByProject } from "@/db/queries/points";
import { getProjectById } from "@/db/queries/projects";
import type { Point, PointModule } from "@/types/database";

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** path | size | modification time: notices a replaced or edited file without reading it. */
export function mediaIdentity(uri: string): string {
  try {
    const file = new File(uri);
    if (!file.exists) return `${uri}|missing`;
    let modified: number | null = null;
    try {
      modified = (file as unknown as { info?: () => { modificationTime?: number | null } }).info?.()
        .modificationTime ?? null;
    } catch {
      modified = null;
    }
    return `${uri}|${file.size}|${modified ?? ""}`;
  } catch {
    return `${uri}|unknown`;
  }
}

export interface CurrentPoints {
  items: BackupItem[];
  /** The candidate points the items were built from (same capture, same moment). */
  points: Point[];
}

export async function collectPointItems(projectId: number): Promise<CurrentPoints> {
  const project = await getProjectById(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const points = await getBackupCandidatePointsByProject(projectId);
  const modules = await getPointModulesByProject(projectId);
  const fields = await getModuleMediaFields(project.protocol_id, project.protocol_source);

  const items = await buildPointItems({
    points,
    modules,
    mediaIdentity,
    yieldToUi,
    moduleMediaUris: async (module: PointModule) => {
      const ofModule = fields.filter((f) => f.moduleId === module.module_id);
      if (ofModule.length === 0) return [];
      const uris: string[] = [];
      await mapModuleMediaUris(module.data_json, ofModule, async (uri) => {
        uris.push(uri);
        return uri;
      });
      return uris;
    },
  });
  return { items, points };
}

export async function collectProjectDataItems(projectId: number): Promise<ProjectDataItems> {
  return buildProjectDataItems(await buildProjectConfigPackage(projectId));
}
