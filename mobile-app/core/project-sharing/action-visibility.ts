import type { Project } from "@/types/database";

export type CollaborationRole = NonNullable<Project["collaboration_role"]> | null | undefined;

export interface ProjectActionVisibility {
  exportConfigPackage: boolean;
  activateDriveBackup: boolean;
  exportPointsToOwner: boolean;
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
 * Collecting points and the collector code are deliberately not part of this
 * table: collection is always available, and the collector-code entry lives
 * in Settings, global to the device.
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
    exportConfigPackage: !isCollaborator,
    activateDriveBackup: isNotShared,
    exportPointsToOwner: isCollaborator,
    backup: isOwner,
    pendingApprovals: isOwner,
    rejectedPoints: isOwner,
    importPoints: isOwner,
  };
}

const ROLE_LABELS: Record<string, string> = {
  owner: "dono",
  collaborator: "colaborador",
  none: "projeto local (sem compartilhamento)",
};

/**
 * Thrown by a service that was called for a project whose role may not
 * perform the action (same family as InvalidCollaborationRoleError). The
 * screens already hide these actions, so this only fires if something calls
 * a service it should not.
 */
export class ProjectRoleNotAllowedError extends Error {
  readonly action: keyof ProjectActionVisibility;
  readonly role: CollaborationRole;

  constructor(action: keyof ProjectActionVisibility, role: CollaborationRole) {
    super(`Esta ação não está disponível para este projeto (papel atual: ${ROLE_LABELS[role ?? "none"]}).`);
    this.name = "ProjectRoleNotAllowedError";
    this.action = action;
    this.role = role;
  }
}

/**
 * Service-side guard derived from the same table the screens use: throws
 * ProjectRoleNotAllowedError unless `getProjectActionVisibility(role)` allows
 * `action`. Each service names the table row it corresponds to, so there is
 * no second copy of the rules.
 */
export function assertProjectActionAllowed(
  role: CollaborationRole,
  action: keyof ProjectActionVisibility,
): void {
  if (!getProjectActionVisibility(role)[action]) {
    throw new ProjectRoleNotAllowedError(action, role);
  }
}
