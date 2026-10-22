import type { Point } from "@/types/database";
import { getProjectActionVisibility, type CollaborationRole } from "./action-visibility";

/**
 * - "review":   owner opening a pending point (read-only + approve/reject).
 * - "readonly": owner opening a rejected point (read-only, no actions).
 * - "normal":   everything else (the regular edit/delete/send actions).
 */
export type PointDetailsMode = "review" | "readonly" | "normal";

/**
 * Single source of truth for how the point details screen behaves, deduced
 * from the point's own approval_status (never from a route param) and the
 * project role. Pending/rejected points only exist on the owner's device, and
 * reviewing them is the owner-only "pendingApprovals" area, so any other role
 * always gets the normal screen.
 */
export function getPointDetailsMode(
  approvalStatus: Point["approval_status"] | undefined,
  role: CollaborationRole,
): PointDetailsMode {
  if (!getProjectActionVisibility(role).pendingApprovals) return "normal";
  if (approvalStatus === "pending") return "review";
  if (approvalStatus === "rejected") return "readonly";
  return "normal";
}
