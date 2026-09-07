// src/db/queries/project-members.ts
import { db } from "../initialize";

export async function upsertProjectMember(
  projectId: number,
  memberEmail: string,
  role: string,
  autoApprove: string,
): Promise<boolean> {
  try {
    await db.runAsync(
      `INSERT INTO project_members (project_id, member_email, role, auto_approve)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(project_id, member_email) DO UPDATE SET
         role = excluded.role,
         auto_approve = excluded.auto_approve`,
      [projectId, memberEmail, role, autoApprove],
    );
    return true;
  } catch (error) {
    console.error("Error upserting project member:", error);
    return false;
  }
}
