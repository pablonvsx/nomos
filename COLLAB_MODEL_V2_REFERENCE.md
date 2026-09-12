# Nomos Collaboration Model — Corrected Design (working reference)

> Temporary reference document for implementation. Supersedes any prior
> description of the collaboration feature, including the old multi-member
> Drive model and the first draft of the single-owner export/import model.
> This is the version to build against. Once implemented and tested, this
> content becomes the basis for docs/arquitetura-nomos/12_COLLABORATION.md.

## 1. Core principle

Exactly one device/account can be the **owner** of a given `project_uuid` at
any time. Ownership is defined by, and only by, having that project connected
to a Google Drive account for backup. Everyone else working on that same
project holds a **collaborator copy** — a fully independent local project
that can never itself become an owner instance of the same `project_uuid`.

No collaborator ever needs a Google account. Only the owner does, and only
for the backup/restore actions.

## 2. Schema changes

### `projects`

Replace the boolean `is_collaborative` with:

```
collaboration_role TEXT NULL DEFAULT NULL  -- 'owner' | 'collaborator' | NULL
```

- `NULL`: a plain local project, never shared in any way.
- `'owner'`: this device is the authoritative source for this `project_uuid`,
  connected to a Drive folder (`drive_folder_id`) for backup.
- `'collaborator'`: this device holds a working copy imported from an
  owner's configuration package. Cannot become `'owner'` for this same
  `project_uuid` — the UI must never offer "Make collaborative" for a project
  in this state.

`drive_folder_id` keeps its current meaning, only ever set when
`collaboration_role = 'owner'`.

### `points`

No new column needed. `drive_synced_at` (already exists) changes meaning
slightly: it now means "timestamp of the last successful backup of this
point's current content to Drive," set only by the explicit backup action
(section 6), never by any automatic sync-on-approve step.

`approval_status` keeps its existing values (`local`, `pending`, `approved`,
`rejected`), but the transitions around it change — see section 5.

## 3. The two packages

### 3.1 Configuration package (Fase 0) — unchanged content, one addition

Add a field making the importer's role explicit:

```json
{
  "format_version": 1,
  "project_uuid": "...",
  "project_name": "...",
  "protocol_id": "...",
  "protocol_source": "official | custom",
  "custom_protocol": { "...": "..." },
  "species_catalog": [ "..." ],
  "vegetation_classes": [ "..." ],
  "package_role_for_importer": "collaborator"
}
```

`package_role_for_importer` is always `"collaborator"` — only an owner ever
exports this package, and importing it always produces a collaborator copy.
On import, the resulting local project is created with
`collaboration_role = 'collaborator'`.

**Only a project with `collaboration_role IS NULL` can be turned into an
owner project.** A project with `collaboration_role = 'collaborator'` must
never show the "Make collaborative" / "Connect to Drive" action.

### 3.2 Points package (Fase 2) — unchanged format

No structural change to the `.zip` shape. What changes is what the collector
can export (section 4) and what the owner does on import (section 5).

## 4. Collaborator-side actions

- Collect points locally, exactly as today. No Google account involved at
  any point in this role.
- **Export a single point** ("Send to project owner") — unchanged from
  today.
- **New: export all points** — a bulk action exporting every point that
  belongs to this local (collaborator) project into one `.zip`, same format
  as the single-point export, just with all of them inside. No local
  "already sent" tracking needed — re-exporting the same points again is
  fine, because the owner's import step (section 5) now handles duplicates
  explicitly.

## 5. Owner-side: importing points, review, and duplicates

When the owner imports a points package:

1. Validate `project_uuid` and protocol as before — if either fails, reject
   the **entire package**, nothing is inserted, clear error message.
2. For every point in the package that passes validation, check whether a
   point with that same point id **already exists locally** in this project,
   regardless of its current `approval_status` (pending, approved, or
   rejected all count).
   - **Not a duplicate** (no local point with that id): insert as
     `approval_status = 'pending'`, exactly as today.
   - **Duplicate**: do not insert automatically. Collect these separately and
     present them to the owner after the import finishes, one row per
     duplicate, with two actions:
     - **Substituir**: overwrite the existing local point's data and module
       content with the incoming version (same point id, so nothing else
       referencing it breaks), and set its `approval_status` back to
       `'pending'` for re-review — treat this as "a correction has arrived,
       look at it again."
     - **Descartar**: ignore the incoming version entirely, keep the local
       point exactly as it is.
3. Show a summary at the end: N new points imported (pending review), M
   duplicates resolved (broken down by substituted/discarded).

## 6. Local approval queue (no Drive involved)

- Lists local points with `approval_status = 'pending'` for the project.
  Purely a local SQL query — no Drive read of any kind happens here.
- **Approve**: sets `approval_status = 'approved'`. That's it — no Drive
  write happens automatically. The point is now part of the project's
  confirmed data, stored locally, not yet backed up.
- **Reject**: sets `approval_status = 'rejected'` with an optional reason.
  No Drive write. The point moves conceptually into the "Rejected" area
  (section 7) — it is **not deleted**.

## 7. Rejected points area

A new screen/section (e.g. `app/(projects)/project-rejected/[id].tsx` or a
tab within the existing collaboration screen) listing points with
`approval_status = 'rejected'` for a project. Each entry shows the rejection
reason and an action to **permanently delete** it. Rejected points are never
auto-purged — they stay until the owner explicitly deletes them.

(Optional, not required: an action to move a rejected point back to
`'pending'` for reconsideration. Include only if it's cheap to add alongside
the delete action.)

## 8. Backup to Drive (replaces "Sincronizar projeto")

The old "Sincronizar projeto" button and its underlying `syncProjectFromDrive`
pull-based logic are removed for this purpose. In their place:

- Every `approved` point has a visible backup indicator, based on
  `drive_synced_at`: **backed up** (non-null) vs **not backed up yet**
  (null). Shown wherever approved points are listed for an owner's project.
- **"Fazer backup"** button (project-level): uploads every approved point
  with `drive_synced_at IS NULL` to the project's Drive folder (reusing
  `submitPointToProject`'s underlying write logic, called in a loop), setting
  `drive_synced_at` on each success. Reports a summary (X backed up, Y
  failed, with reasons if any failed — e.g. no connection).
- A per-point **"Fazer backup deste ponto"** action for backing up one at a
  time, same underlying call.
- Only available when `collaboration_role = 'owner'` and a Google account is
  connected.

## 9. Restoring the owner's own project on another device

This is the **only** remaining scenario where the app reads from Drive
proactively. Framed clearly as "your own backup," not "shared projects":

- In "Meu Nomos", a section (or action) "Restaurar meus projetos do Drive",
  visible only when a Google account is connected. Lists the signed-in
  account's own Nomos project folders in Drive
  (`listOwnNomosProjectFolders`) that don't already have a local project
  linked to them.
- "Baixar" recreates the local project (`collaboration_role = 'owner'`,
  `drive_folder_id` set) and pulls down every backed-up point, with its
  correct `created_by`/collector code and `approval_status = 'approved'`
  (only approved, backed-up points ever live in Drive under this model —
  pending/rejected points are never uploaded, so there is nothing else to
  pull).
- This flow requires the account to actually be the owner (it only ever
  lists folders owned by that same account, so this is inherently
  self-limited — no third-party access question applies here, unlike the
  abandoned multi-member model).

## 10. Access to the collaboration screens: Google account requirement

Google account connection is required **only** for owner-specific actions:
turning a project into `'owner'`, the backup actions (section 8), and
restoring from Drive (section 9).

It must **not** be required to:
- View a collaborator-role project's own screen.
- Export points as a collaborator (section 4).
- Review the local approval queue as an owner (section 6) — this is pure
  local SQL, no Drive.
- View the rejected points area (section 7).

Audit and fix any screen/component that currently gates the whole
collaboration area behind a connected Google account — the gate belongs on
the specific owner-only actions, not the screen as a whole.

## 11. Collector code

Exactly 4 characters, required (not optional, not 2-4). Update validation in
the settings modal accordingly, including the label text.

## 12. Known bugs to fix (not new features, regressions in the current code)

- **Photos not rendering after import.** Investigate whether the imported
  point's `photos` field ends up pointing at a path that doesn't survive
  past the import operation (e.g. a temporary extraction directory that gets
  cleaned up), instead of a persisted app storage path.
- **Audio not playing after import** (play button present, playback fails).
  Same class of bug, likely the same root cause as the photo issue, applied
  to `audio_notes`.

## 13. What this explicitly removes/deprecates from the current code

- The "Sincronizar projeto" button and any UI copy calling it that (replaced
  by "Fazer backup", section 8).
- Any code path that lets a `collaboration_role = 'collaborator'` project be
  turned into `'owner'`.
- Any remaining assumption that approving a point automatically pushes it to
  Drive — approval and backup are now fully decoupled steps.
