import type { Project } from "@/types/database";

export type CollaborationRole = NonNullable<Project["collaboration_role"]> | null | undefined;

export interface ProjectActionVisibility {
  collectPoints: boolean;
  exportConfigPackage: boolean;
  activateDriveBackup: boolean;
  exportPointsToOwner: boolean;
  collectorCode: boolean;
  backup: boolean;
  pendingApprovals: boolean;
  rejectedPoints: boolean;
  importPoints: boolean;
}

/**
 * Single source of truth for which collaboration action each project role
 * sees (section 10.0 of COLLAB_MODEL_REFERENCE.md). Every screen must derive
 * its buttons/cards from this instead of checking the role inline - it is a
 * strict role boundary, not a Google-account boundary.
 *
 * `null`/`undefined` both mean "a plain local project, never shared".
 * `importPoints` is not a row of the table; it is the owner-side half of the
 * points package flow (section 5), so it follows the owner column.
 */
export function getProjectActionVisibility(role: CollaborationRole): ProjectActionVisibility {
  const isOwner = role === "owner";
  const isCollaborator = role === "collaborator";
  const isNotShared = role == null;

  return {
    collectPoints: true,
    exportConfigPackage: !isCollaborator,
    activateDriveBackup: isNotShared,
    exportPointsToOwner: isCollaborator,
    collectorCode: isCollaborator,
    backup: isOwner,
    pendingApprovals: isOwner,
    rejectedPoints: isOwner,
    importPoints: isOwner,
  };
}
