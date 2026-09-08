# 12. Collaboration

A project doesn't have to stay on one device. It can be made **collaborative**, backed by a shared Google Drive folder: an admin invites collaborators by email, each collaborator submits points for approval (or auto-approval, depending on policy), and a sync pulls the approved data back down into everyone's local SQLite. This sits entirely on top of the existing offline-first model — collection itself never depends on connectivity; only submission, approval, and sync do. There is no Nomos server: Drive *is* the transport.

## Google authentication

`core/google-auth/google-auth-service.ts` wraps `@react-native-google-signin/google-signin` (the native sign-in flow — `expo-auth-session` is no longer maintained by Expo for this provider as of SDK 53), requesting only the `drive.file` scope (not full Drive access, and not subject to Google's stricter verification/CASA process). It exports:

- `GoogleAccount` — `{ email: string; name: string | null }`
- `signInWithGoogle(): Promise<GoogleAccount>`, `signOutFromGoogle(): Promise<void>`
- `getCurrentGoogleAccount(): GoogleAccount | null` — synchronous, reads whatever session is already active
- `getDriveAccessToken(): Promise<string>` — used by every `core/drive-sync/` call to build request headers
- `isCancelledSignIn(error: unknown): boolean`

`hooks/use-google-account.ts` is the thin React wrapper (`{ account, isConnecting, error, connect, disconnect }`), consumed from the Google Account row in Settings (`app/(tabs)/settings.tsx:227-246`, opening `GoogleAccountSettingsModal`). Note: while the project is in "Testing" publishing status on Google Cloud Console, the OAuth grant expires 7 days after consent — an external operational constraint, not something the code controls.

## The `core/drive-sync/` layer

Seven files, each with a narrow responsibility:

| File | Responsibility | Main exports |
|---|---|---|
| `drive-api-client.ts` | Raw Google Drive REST v3 wrapper — no separate Drive SDK dependency | `createFolder`, `findChildByName`, `listChildren`, `listSharedFolders`, `uploadJsonFile`, `updateJsonFile`, `uploadBinaryFile`, `downloadBinaryFile`, `readJsonFile`, `shareWithEmail`, `moveFile`, `revokePermissionForEmail` |
| `project-drive-service.ts` | Core orchestration: folder structure, `manifest.json`, membership, invites, promotion, join | `createCollaborativeProjectStructure`, `getManifest`/`updateManifest`, `inviteCollaboratorByEmail`, `promoteToAdmin`, `removeCollaborator`, `joinCollaborativeProject`, `joinAndCreateLocalProject`, `updateOwnCollectorCode`, `deriveDefaultCollectorCode` |
| `point-submission-service.ts` | Uploads a local point (and its photos) to Drive for approval | `submitPointToProject` |
| `approval-service.ts` | Admin queue: list/approve/reject pending submissions | `listPendingSubmissions`, `approveSubmission`, `rejectSubmission` |
| `project-sync-service.ts` | Pulls approved points and current membership back into local SQLite | `syncProjectFromDrive` |
| `reference-data-sync-service.ts` | Bidirectional sync of the shared species catalog and vegetation classifications | `syncReferenceData`, `pushSpeciesEntryIfCollaborative`, `pushVegetationClassificationIfCollaborative` |
| `point-label.ts` | Pure display helper — no I/O | `getPointDisplayLabel`, `toMemberLiteList` |

**Layer note**: `core/drive-sync/` is the one place inside `core/` that imports directly from `db/queries/*` (`project-drive-service.ts`, `project-sync-service.ts`, `point-submission-service.ts`, and `reference-data-sync-service.ts` all read/write projects, points, project members, or custom protocols). This isn't covered by any rule in `protocol-kernel/__tests__/layer-rules.test.ts` (which passes, 18/18), so it's allowed, not a violation — but it's a real exception to the rest of `core/`'s pattern, worth knowing about. Kernel-type imports still follow the usual `import type`-only rule (`point-submission-service.ts:7`, `project-sync-service.ts:8`, both `import type { ProtocolRegistry }`). See [01_ARCHITECTURE.md](01_ARCHITECTURE.md).

## Drive folder structure

```
Nomos/                                    one root folder per Google account
└── Nomos_<project_name>_<project_uuid>/
    ├── manifest.json
    ├── protocol-package.json             only if protocol_source = 'custom'
    ├── submissions/
    │   └── <collaborator_email>/
    │       ├── <point_uuid>.json
    │       └── _reviewed/                decided submissions, moved here after approve/reject
    ├── approved/
    │   └── <point_uuid>.json
    ├── media/
    │   └── <point_uuid>/                  photos for that point (approved or not)
    ├── species-catalog/
    │   └── <catalog_entry_uuid>.json
    └── vegetation-classes/
        └── <vegetation_class_uuid>.json
```

There is no edit-history folder — overwrites are always "last write wins" (see Known limitations). A decided submission is moved into `submissions/<email>/_reviewed/` (`approval-service.ts`'s `archiveDecidedSubmission`) so `listPendingSubmissions` never re-reads it.

### `manifest.json`

The `ProjectManifest` shape (`project-drive-service.ts:46-57`):

```typescript
interface ProjectManifest {
  project_uuid: string;
  project_name: string;
  protocol_id: string;
  protocol_source: 'official' | 'custom';
  auto_approve_default: boolean;
  members: ProjectMemberEntry[];
  drive_ids?: { submissions_folder_id: string; approved_folder_id: string };
}

interface ProjectMemberEntry {
  email: string;
  role: 'admin' | 'collaborator';
  auto_approve: 'herda_projeto' | 'true' | 'false';
  collector_code: string;
}
```

- **Auto-approval precedence**: if a member's own `auto_approve` is `'true'`/`'false'`, that wins; `'herda_projeto'` ("inherits from the project") falls back to `manifest.auto_approve_default` (`point-submission-service.ts:96-100`).
- **`drive_ids`**: written once at project creation; anything that needs the `submissions`/`approved` folder IDs should read them via `resolveProjectDriveIds()` (`project-drive-service.ts:203-218`), which falls back to discovering the folders by name and writing them back into the manifest for projects created before this field existed. Reads accept the older camelCase key names too (`normalizeDriveIds()`, `project-drive-service.ts:62-69`), but every write always uses the current snake_case shape — old projects migrate silently on their next write.

`protocol-package.json` (only for `protocol_source: 'custom'`) holds `{ uuid, name, theme, schema }` — the serialized `CustomProtocolSchema`. It's written once at collaborative-project creation and never rewritten: a custom protocol already can't be edited or deleted locally while any project uses it (a pre-existing, non-collaboration-specific rule), so the schema tied to a collaborative project is effectively immutable for that project's lifetime, on every device. When a collaborator joins, the package is downloaded and reconciled by `uuid` against their own local `custom_protocols` table (`getCustomProtocolByUuid`/`createCustomProtocolFromPackage`), and the same edit-lock then applies on their device too.

A point file (`submissions/<email>/<uuid>.json` or `approved/<uuid>.json`) is the same `PointEnvelope` used by CSV/GeoJSON export, plus `submitted_by`, `submitted_at`, `approval_status`, and `rejection_reason` when applicable. Photos are referenced by filename only, not by local URI (`point-submission-service.ts:69`).

## Local data model

`points.created_by/approval_status/rejection_reason/drive_synced_at`, `projects.is_collaborative/drive_folder_id/auto_approve_default`, the new `project_members` table, and the `uuid` columns on `custom_protocols`/`project_species_catalog`/`vegetation_classifications` are all detailed in [05_DATA_MODEL.md](05_DATA_MODEL.md) — not repeated here. One thing worth calling out: `project_members` is only a local *mirror* of `manifest.members`, refreshed on every sync (`project-sync-service.ts:58-60`) and every membership change; the durable record is always the Drive manifest.

## Roles and permissions

| Action | Collaborator | Admin |
|---|---|---|
| Create points offline | Yes | Yes |
| Submit/resubmit own points | Yes | Yes (any point) |
| Edit a point created by someone else | No | Yes |
| Approve/reject pending points | No | Yes |
| Set auto-approval (project or per-member) | No | Yes |
| Invite by email | No | Yes |
| Promote a member to admin | No | Yes |
| Change own collector code | Yes | Yes |
| Remove a collaborator | No | Yes (never the only remaining admin) |
| Sync/download the project | Yes | Yes |

Enforced in `project-drive-service.ts`/`approval-service.ts` by checking the caller's email against `manifest.members` before any write — `inviteCollaboratorByEmail` (`:220-248`), `promoteToAdmin` (`:357-375`), `removeCollaborator` (`:324-355`), and `approveSubmission`/`rejectSubmission` (`approval-service.ts`'s `assertIsAdmin`, `:57-62`) all throw before touching Drive if the caller isn't found as an admin member. **Important**: these checks live entirely in the app — nothing on the Drive file itself enforces them, since there's no Nomos server. This is an accepted risk, consistent with the premise of a small, trusted team; see Known limitations.

## Main flows

**Making a project collaborative** — `createCollaborativeProjectStructure()` (`project-drive-service.ts:127-178`) creates the folder tree, generates `project_uuid`, and writes `manifest.json` with the creator as the sole admin (`collector_code` derived from their email via `deriveDefaultCollectorCode`); for a custom protocol it also uploads `protocol-package.json`.

**Joining a shared project** — there's no dedicated screen or deep link. `app/(projects)/projects.tsx` has a Drive-folder picker dialog listing the caller's own and shared `Nomos_*` folders (`listAllDriveProjects`); picking one calls `joinAndCreateLocalProject()` (`project-drive-service.ts:377-402`), which adds the user to `manifest.members` if not already present, reconciles a custom protocol by `uuid` if needed, creates the local project row, and runs an initial sync. See [09_SCREEN_FLOW.md](09_SCREEN_FLOW.md).

**Inviting by email** — `inviteCollaboratorByEmail(driveFolderId, callerEmail, emailToInvite)` (`project-drive-service.ts:220-248`) checks the caller is an admin, checks the invitee isn't already a member, shares the Drive folder with them (`shareWithEmail`, role `writer`), and appends a new `collaborator` entry with a derived `collector_code`. Exposed from the collaboration screen (`project-collaboration/[id].tsx`).

**Submitting a point** — `submitPointToProject()` (`point-submission-service.ts:20-128`) checks the caller owns the point or is an admin, uploads any local photos once (skipping ones already present by filename), and then branches: a point already `approved` is overwritten directly in `approved/` (a correction, not a new review); otherwise the effective auto-approval rule decides whether it lands in `approved/` or `submissions/<email>/`, and the local row is updated with the resulting `approval_status`.

**Approving/rejecting** — `listPendingSubmissions()` scans `submissions/*/` for files with `approval_status: 'pending'`; `approveSubmission()` copies the content into `approved/<uuid>.json` (or updates it if already there) and archives the original; `rejectSubmission()` just writes `approval_status: 'rejected'` + `rejection_reason` in place and archives it — nothing is copied to `approved/`.

**Syncing** (`syncProjectFromDrive()`, `project-sync-service.ts:40-211`) — one button, with an "data only" vs. "data and media" choice, in this order: refresh the local `project_members` mirror → bidirectional reference-data sync (species catalog, vegetation classifications) → reconcile locally-pending points against Drive (pick up a rejection's reason, or notice one got approved elsewhere) → walk `approved/`, importing files with no local match and updating any whose Drive `modifiedTime` is newer than the local `drive_synced_at` (skipping already-current ones; media is only downloaded on first import, never re-fetched on an update). Returns a summary (`imported`, `updated`, `rejected`, `skipped`, `mediaDownloaded`, plus the reference-data counts).

**Point numbering** — `point_number` stays a simple local counter, unchanged. What the UI shows is a computed label, `getPointDisplayLabel()` (`point-label.ts:11-20`): `"<collector_code>-<point_number>"` in a collaborative project, or just the raw number otherwise — this avoids two collaborators' devices independently generating the same visible number.

**The collaboration screen** (`project-collaboration/[id].tsx`, reached from `project-details/[id].tsx:893`) is the single hub: make the project collaborative (if not already), member list with editable collector codes (own code only), project- and per-member auto-approval toggles (admin-only), a "my points" list still awaiting approval with a submit/resubmit button, a sync button, and — admin-only — a link to the approval queue (`project-approvals/[id].tsx`, `:585`) plus invite/promote/remove controls.

## Invites: email only, by design

The only invite mechanism is by email, through `inviteCollaboratorByEmail`. Invite-by-link/QR-code was evaluated and deliberately rejected: an "anyone with the link" grant conflicts with the small, trusted-team premise the rest of the design leans on (no edit history, permissions enforced only in the app). A nominal, per-email invite keeps Drive's own sharing UI as an honest audit trail of who has access and why. Two helper functions written in anticipation of the link/QR option (`setAnyoneWithLinkPermission`/`revokeAnyoneWithLinkPermission` in `drive-api-client.ts`) were removed once that direction was dropped, since they had no other caller.

## Known limitations (accepted)

- No edit history — an overwrite is always "last write wins."
- Permissions are enforced in the app UI, not at the Drive file level (see Roles and permissions above).
- In "Testing" publishing status on Google Cloud Console, the OAuth grant expires every 7 days.
- `manifest.json` is read and rewritten whole, with no concurrency control — two people editing it at nearly the same time can overwrite each other's change.
- Archiving a decided submission into `_reviewed/` isn't atomic with writing its new status: a network failure between the two steps leaves the file with the right status but outside `_reviewed/`, so it gets needlessly re-read until the next approve/reject attempt (which self-corrects).
- The immediate push of a manually-added species/vegetation-classification entry (`pushSpeciesEntryIfCollaborative`/`pushVegetationClassificationIfCollaborative`) is fire-and-forget and doesn't check whether the file already exists on Drive — a narrow race between adding an item and syncing at nearly the same time can produce a duplicate file, later reconciled as two local rows on another device.
- The local `project_members` mirror only ever adds/updates — it never removes a member who was deleted from the project by another device. No permission risk (every admin/ownership check reads the live manifest), but the local table can hold stale rows.
