/**
 * Which points may go to the owner's Drive backup, by approval status.
 *
 * `null` is the owner's own field work (collected directly, never submitted
 * for review) and `approved` is a collaborator's point the owner accepted -
 * the same set the app shows as visible points (VISIBLE_POINT_CONDITION in
 * db/queries/points.ts, which the backup query is built on). `pending` and
 * `rejected` points never reach the backup.
 *
 * Whether the project is the owner's is a separate check (collaboration_role).
 */
export function isBackupEligibleStatus(status: string | null | undefined): boolean {
  return status === null || status === undefined || status === "approved";
}
