import {
  listChildren,
  readJsonFile,
  updateJsonFile,
  uploadJsonFile,
  moveFile,
  findChildByNameSuffix,
  renameFile,
} from './drive-api-client';
import { getManifest, resolveProjectDriveIds, ensureFolder } from './project-drive-service';
import { extractPointUuidFromName } from './point-label';

export interface PendingSubmission {
  driveFileId: string;
  driveFileName: string;
  emailFolderId: string;
  submitterEmail: string;
  pointUuid: string;
  content: Record<string, unknown>;
}

export async function listPendingSubmissions(
  projectDriveFolderId: string
): Promise<PendingSubmission[]> {
  const manifest = await getManifest(projectDriveFolderId);
  const { submissions_folder_id: submissionsFolderId } = await resolveProjectDriveIds(projectDriveFolderId, manifest);

  const emailFolders = await listChildren(submissionsFolderId);
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
          driveFileName: file.name,
          emailFolderId: emailFolder.id,
          submitterEmail: emailFolder.name,
          pointUuid: extractPointUuidFromName(file.name),
          content,
        });
      }
    }
  }

  return result;
}

// Moves a decided submission's original file out of submissions/<email>/ and
// into submissions/<email>/_reviewed/, so listPendingSubmissions stops
// re-reading it on every future call.
async function archiveDecidedSubmission(submission: PendingSubmission): Promise<void> {
  const reviewedFolderId = await ensureFolder('_reviewed', submission.emailFolderId);
  await moveFile(submission.driveFileId, reviewedFolderId, submission.emailFolderId);
}

function assertIsAdmin(manifest: Awaited<ReturnType<typeof getManifest>>, callerEmail: string): void {
  const isAdmin = manifest.members.some((m) => m.email === callerEmail && m.role === 'admin');
  if (!isAdmin) {
    throw new Error('Apenas administradores podem aprovar ou rejeitar submissões.');
  }
}

export async function approveSubmission(
  projectDriveFolderId: string,
  submission: PendingSubmission,
  callerEmail: string
): Promise<void> {
  const manifest = await getManifest(projectDriveFolderId);
  assertIsAdmin(manifest, callerEmail);
  const { approved_folder_id: approvedFolderId } = await resolveProjectDriveIds(projectDriveFolderId, manifest);
  const updatedContent = { ...submission.content, approval_status: 'approved' };

  // Reuses the submission's own (already human-readable) name for the
  // approved/ copy instead of rebuilding it - approval-service has no
  // point_number/collector_code of its own to construct a label with, and
  // doesn't need to: the name submitPointToProject gave it is already
  // current as of the moment it was submitted.
  const existingApproved = await findChildByNameSuffix(approvedFolderId, `${submission.pointUuid}.json`);
  if (existingApproved) {
    if (existingApproved.name !== submission.driveFileName) {
      await renameFile(existingApproved.id, submission.driveFileName);
    }
    await updateJsonFile(existingApproved.id, updatedContent);
  } else {
    await uploadJsonFile(submission.driveFileName, approvedFolderId, updatedContent);
  }

  await updateJsonFile(submission.driveFileId, updatedContent);
  await archiveDecidedSubmission(submission);
}

export async function rejectSubmission(
  projectDriveFolderId: string,
  submission: PendingSubmission,
  reason: string,
  callerEmail: string
): Promise<void> {
  const manifest = await getManifest(projectDriveFolderId);
  assertIsAdmin(manifest, callerEmail);
  const updatedContent = {
    ...submission.content,
    approval_status: 'rejected',
    rejection_reason: reason,
  };
  await updateJsonFile(submission.driveFileId, updatedContent);
  await archiveDecidedSubmission(submission);
}
