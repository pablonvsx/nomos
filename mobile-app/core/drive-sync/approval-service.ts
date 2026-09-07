import {
  findChildByName,
  listChildren,
  readJsonFile,
  updateJsonFile,
  uploadJsonFile,
} from './drive-api-client';
import { ensureFolder } from './project-drive-service';

export interface PendingSubmission {
  driveFileId: string;
  submitterEmail: string;
  pointUuid: string;
  content: Record<string, unknown>;
}

export async function listPendingSubmissions(
  projectDriveFolderId: string
): Promise<PendingSubmission[]> {
  const submissionsFolder = await findChildByName(projectDriveFolderId, 'submissions');
  if (!submissionsFolder) return [];

  const emailFolders = await listChildren(submissionsFolder.id);
  const result: PendingSubmission[] = [];

  for (const emailFolder of emailFolders) {
    if (emailFolder.mimeType !== 'application/vnd.google-apps.folder') continue;
    const files = await listChildren(emailFolder.id);
    for (const file of files) {
      if (!file.name.endsWith('.json')) continue;
      const content = await readJsonFile<Record<string, unknown>>(file.id);
      if (content.approval_status === 'pending') {
        result.push({
          driveFileId: file.id,
          submitterEmail: emailFolder.name,
          pointUuid: file.name.replace('.json', ''),
          content,
        });
      }
    }
  }

  return result;
}

export async function approveSubmission(
  projectDriveFolderId: string,
  submission: PendingSubmission
): Promise<void> {
  const approvedFolderId = await ensureFolder('approved', projectDriveFolderId);
  const updatedContent = { ...submission.content, approval_status: 'approved' };

  const existingApproved = await findChildByName(approvedFolderId, `${submission.pointUuid}.json`);
  if (existingApproved) {
    await updateJsonFile(existingApproved.id, updatedContent);
  } else {
    await uploadJsonFile(`${submission.pointUuid}.json`, approvedFolderId, updatedContent);
  }

  await updateJsonFile(submission.driveFileId, updatedContent);
}

export async function rejectSubmission(
  submission: PendingSubmission,
  reason: string
): Promise<void> {
  const updatedContent = {
    ...submission.content,
    approval_status: 'rejected',
    rejection_reason: reason,
  };
  await updateJsonFile(submission.driveFileId, updatedContent);
}
