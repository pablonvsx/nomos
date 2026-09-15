# Nomos Collaboration Model — Corrected Design (working reference)

> Temporary reference document for implementation. Supersedes any prior
> description of the collaboration feature, including the old multi-member
> Drive model and the first draft of the single-owner export/import model.
> This is the version to build against. Once implemented and tested, this
> content becomes the basis for docs/12_BACKUP_AND_COLLABORATION.md. (FAQ turns to 13_FAQ)

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

Also add:

```
owner_email TEXT NULL DEFAULT NULL
```

Set once, at the moment a project becomes `'owner'` (turning on backup), to
the email of the Google account connected at that moment. Never changes
afterward for that project. Purely a secondary identity signal — see section
14.3 for how it's used and why it does not replace `project_uuid` as the
real identity of a project.

### `points`

**Correction (Fase 2):** this section originally assumed `approval_status`,
`created_by` and `drive_synced_at` already existed on `points` in this
branch (carried over from an earlier, abandoned attempt at this model). On
`feature/backup-and-collaboration`, freshly cut from v1.0.0, none of them
did. They were added directly in `db/initialize.ts`'s `CREATE TABLE`
statement for `points` as part of Fase 2, with no migration path — the
local database is reset entirely during this reformulation, so there was
no need to `ALTER TABLE` existing installs the way Fase 0 did for
`projects`/`custom_protocols`/etc. A `uuid` column was added the same way,
since duplicate detection (section 5) needs a stable cross-device
identifier and the local `points.id` (an `AUTOINCREMENT` integer) isn't
portable between devices.

`drive_synced_at` means "timestamp of the last successful backup of this
point's current content to Drive," set only by the explicit backup action
(section 6), never by any automatic sync-on-approve step.

`approval_status` takes the values `NULL`, `pending`, `approved`,
`rejected` — see section 5 for the transitions around it.

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
  "package_role_for_importer": "collaborator",
  "owner_email": "..."
}
```

`owner_email` is the exporting project's `owner_email` column (may be `null`
if the project has never had backup activated — exporting a config package
does not require `collaboration_role = 'owner'`). A collaborator copy stores
this value locally too, purely as passthrough metadata — it plays no role in
anything a collaborator does, since collaborators never touch Drive or
Google accounts. See section 14.3 for where it's actually used.

`package_role_for_importer` is always `"collaborator"` — only an owner ever
exports this package, and importing it always produces a collaborator copy.
On import, the resulting local project is created with
`collaboration_role = 'collaborator'`.

**Only a project with `collaboration_role IS NULL` can be turned into an
owner project.** A project with `collaboration_role = 'collaborator'` must
never show the "Make collaborative" / "Connect to Drive" action.

### 3.2 Points package (Fase 2) — one addition

Structurally still a `.zip` with `points.json` + media, unchanged shape for
the points array itself. `points.json` gains one top-level field alongside
`project_uuid`/`protocol_id`/`collector_code`:

```json
{ "owner_email": "..." }
```

Copied from the collaborator's local project row (itself inherited from the
configuration package, section 3.1) at export time. May be `null` — that's
expected and not an error, see section 14.3.

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
   the **entire package**, nothing is inserted, clear error message. This
   remains the one and only real identity check — see section 14.3 for the
   secondary, non-blocking `owner_email` check that runs alongside it.
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
  `drive_synced_at` on each success. This includes the point's photos and
  audio notes, not just its data fields — a point is not considered backed
  up if its media failed to upload. Reports a summary (X backed up, Y
  failed, with reasons if any failed — e.g. no connection).
- A per-point **"Fazer backup deste ponto"** action for backing up one at a
  time, same underlying call, same all-or-nothing rule for its media.
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
  pull). Offer the same two-speed choice the app already uses elsewhere for
  this kind of operation — "Somente dados" (skip downloading media, faster)
  vs "Dados e mídia" (full restore) — rather than always downloading
  everything unconditionally.
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

### 10.1 The connection modal is a shared component, not a Settings-only screen

Build the Google account connection UI as a single reusable modal, with one
home base in Settings (where it can always be opened directly), but
triggerable from **any** action anywhere in the app that turns out to need a
connected account. Concretely: when the owner taps "Ativar backup no Drive",
"Fazer backup", or "Restaurar meus projetos do Drive" without a connected
account, open this same modal in place, right there — don't redirect to
Settings and make the person find their way back to what they were doing.
Once connected, the action that triggered it should resume automatically
(or the person taps it again, whichever is simpler to implement correctly)
rather than requiring a second trip through Settings.

## 11. Collector code

Exactly 4 characters, required (not optional, not 2-4). Update validation in
the settings modal accordingly, including the label text.

No uniqueness check against other collaborators is needed or possible in
this model — there is no shared registry of codes to check against (that
belonged to the old multi-member manifest, which no longer exists). Two
different collaborators can pick the same 4 characters; it only matters as
a display label alongside a point's own id, which is already unique. Don't
build any cross-device collision detection for it.

The code is copied onto each point as a static value at the moment that
point is created/exported (`created_by`), not looked up dynamically later.
If the person changes their code in Settings afterward, points they already
created keep whatever code was set at the time — this is expected, not a
bug to fix.

### 11.1 The collector code modal is a shared component too

Same pattern as 10.1: one modal, with a home base in Settings, but also
triggerable from the collaborator's export action(s) (section 4) if no
collector code is set yet — a collaborator must never be able to export a
point or a full project's points without one, and should never have to
leave the project screen to go set it up before exporting. Once set, the
export the person was trying to do should proceed (or they tap export
again), same resumption principle as 10.1.

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

## 14. Implementation discipline (lessons from the first attempt — read before writing any code)

These two rules are not optional style preferences. Violating either one is
exactly what broke the first implementation attempt of this model, in ways
that were hard to diagnose after the fact. Apply them from the first line of
code, in every phase.

### 14.1 Never reconstruct `manifest.json` (or any Drive JSON file) from scratch

Any function that updates a JSON file already on Drive (`manifest.json`,
`protocol-package.json`, etc.) must always:

1. Read the current file first.
2. Change only the specific field(s) that function is responsible for.
3. Write the full object back, preserving every other field untouched —
   `project_uuid` above all, but this applies to every field.

Never build a new object literal from local state and write it over the
existing file. Doing so silently discards fields that function didn't know
about (most dangerously `project_uuid`, which then makes every future
package importer/restorer reject the project as "not the same project,"
because the identity itself was overwritten with a fresh one — this was the
exact failure in the first attempt).

When two different functions (e.g. one activating backup, another pushing a
newly-added species) both write to the same manifest, both must follow this
read-modify-write pattern independently. Do not assume the file was just
written by another function in the same session — always re-read it.

### 14.2 Never persist a file path from a temporary or extraction-only location

Any code that receives a file from outside the app's own persistent storage
— extracted from a `.zip`, returned by a document picker, downloaded from
Drive — must copy that file into the app's persistent storage directory
(the same directory convention already used by normal photo/audio capture)
**before** writing its path into any database field. Never write a path
that points into:

- A temporary extraction directory used only during unzip processing.
- The raw URI returned by a document picker (which may be a `content://`
  reference to another app's storage, not a real local file at all, and may
  not survive past the current operation even when it looks like a plain
  path).

Verify this by writing an automated test that checks the file still exists
at the saved path *after* the importing/exporting function has returned —
not just that the field was populated with some string. A field with a
plausible-looking path that points nowhere is exactly the kind of bug that
passed code review before and only showed up testing on a real device.

Additionally: before calling any native unzip function, always create the
destination directory explicitly (idempotently) and verify the source file
exists and has non-zero size. Some native zip libraries fail with an
uncatchable native crash (not a rejected JS promise) when given a bad
destination or a virtual/unavailable source path — defensive checks before
the call are the only reliable protection, since the failure cannot always
be caught in JavaScript after the fact.

### 14.3 `owner_email` is a secondary signal, never the identity check

`project_uuid` is, and remains, the only real identity of a project. Nothing
in this section changes that. `owner_email` (sections 2 and 3.1/3.2) exists
purely to make the failure mode from the first attempt easier to catch and
diagnose quickly if it ever happens again — it does not replace or weaken
the `project_uuid` check in any way.

Concretely:

- Whenever a function performs the read-modify-write on `manifest.json`
  required by 14.1, if the object it read had a non-null `owner_email`, the
  object it's about to write back must still have that same value. If it
  doesn't (e.g. the field is missing or empty after the modification),
  **throw before writing** rather than silently saving a manifest that lost
  it. This turns an entire class of "reconstructed the object instead of
  modifying it" mistakes into an immediate, loud failure at write time,
  instead of a confusing "wrong project" error discovered much later on a
  different device.
- When the owner imports a points package (section 5, step 1): after the
  `project_uuid` check passes, if the package's `owner_email` is non-null
  and does not match the currently connected Google account's email, show a
  clear warning before proceeding (not a hard rejection — a collaborator
  copy's `owner_email` can legitimately be stale or `null` depending on when
  it was set, so this must never block a legitimate import on its own). The
  warning exists to catch the specific case where `project_uuid` collided or
  drifted unexpectedly, giving the owner a second signal before they approve
  data that might not actually be theirs.

### 14.4 Follow the app's existing visual conventions

Do not introduce new UI patterns for this feature. Before building any
screen or component, look at how the rest of the app already does it, and
match it — justified body text, rectangular buttons with rounded corners,
existing spacing/typography scale, existing component library usage. If an
existing reusable component covers a need (a button style, a list item, a
modal/dialog shell), use it instead of writing a new one from scratch.

### 14.4b Code, identifiers, and comments: always in English

This applies without exception, even though the person you're working with
communicates in Portuguese and the app's UI strings (i18n) are
user-facing content in Portuguese: every file name, variable, function,
type, and code comment for this feature must be in English, matching the
rest of the codebase's existing convention. Never write a comment or name a
variable in Portuguese, even when the surrounding UI copy right next to it
is in Portuguese. If anything in the current codebase already breaks this
convention, follow the convention (English) for new code regardless — don't
copy an inconsistency forward.


### 14.5 One shared UUID helper, and always check-before-generate

Every place this model generates a `uuid` (`project_uuid`, and the `uuid`
column on `custom_protocols`, `project_species_catalog`,
`vegetation_classifications`) must go through a single shared utility
function, not whatever each file happens to reach for locally. Mixing
approaches across files is how subtle format inconsistencies creep in.

Every one of these generation points must check for an existing value
first and reuse it if present — never regenerate and overwrite a `uuid`
that's already set, even if the surrounding function runs again later (e.g.
exporting the same project's configuration package a second time must
produce the exact same `project_uuid`, `custom_protocol.uuid`, and every
catalog item's `uuid` as the first time).

### 14.6 Reject unknown package format versions explicitly

Both packages carry `format_version: 1`. Any function reading one must check
this field before touching anything else in the object, and fail with a
clear, specific message ("Este arquivo foi criado por uma versão mais nova
do Nomos" or similar) if the value isn't a version this build understands —
never fall through to reading fields optimistically and produce a confusing
downstream error instead.

### 14.7 A fix is not done until there is proof, not a description of one

This model has already been implemented once. Several fixes were reported
as complete and tested in that attempt, across multiple review rounds, that
turned out on real-device testing not to actually be in the code, or not to
work the way the report described. Apply extra scrutiny this time:

- Never report a bug fixed based on reasoning about what the code *should*
  do — read the actual current file content and quote the exact lines that
  demonstrate the fix, every time.
- For anything in section 12 (or any bug found during this second attempt),
  write an automated test that fails before the fix and passes after it,
  and include both outputs (red, then green) when reporting the fix as
  done. A test that only exists to confirm the happy path, without ever
  having been run against the broken version first, does not count as
  proof.
- If asked to confirm a previous session's claimed fix, actually re-read the
  relevant file and re-run the relevant test before answering — do not
  answer from the description of what that session reported doing.


