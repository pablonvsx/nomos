// src/db/queries/project-members.ts
import { db } from "../initialize";
import type { ProjectMember } from "@/types/database";

export async function upsertProjectMember(
  projectId: number,
  memberEmail: string,
  role: string,
  autoApprove: string,
  collectorCode?: string | null,
): Promise<boolean> {
  try {
    await db.runAsync(
      `INSERT INTO project_members (project_id, member_email, role, auto_approve, collector_code)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(project_id, member_email) DO UPDATE SET
         role = excluded.role,
         auto_approve = excluded.auto_approve,
         collector_code = excluded.collector_code`,
      [projectId, memberEmail, role, autoApprove, collectorCode ?? null],
    );
    return true;
  } catch (error) {
    console.error("Error upserting project member:", error);
    return false;
  }
}

export async function removeProjectMember(projectId: number, email: string): Promise<boolean> {
  try {
    await db.runAsync(
      "DELETE FROM project_members WHERE project_id = ? AND member_email = ?",
      [projectId, email],
    );
    return true;
  } catch (error) {
    console.error("Error removing project member:", error);
    return false;
  }
}

export async function getProjectMembers(projectId: number): Promise<ProjectMember[]> {
  try {
    return await db.getAllAsync<ProjectMember>(
      "SELECT * FROM project_members WHERE project_id = ?",
      [projectId],
    );
  } catch (error) {
    console.error("Error fetching project members:", error);
    return [];
  }
}
