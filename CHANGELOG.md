# Changelog

All notable changes to Nomos are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.1.0] - first public release

First version meant for general use. These notes describe what the app does
and where it still has limits.

### Added

- **Field data collection** with the Paisageo landscape-mapping protocol:
  vegetation structure (Küchler physiognomic formula, with an optional custom
  vegetation classification per project), geoecological constraints, and
  environmental impacts, with photos, audio notes and text notes.
- **Custom protocols**: a builder for protocols with your own fields (text,
  numbers, selections, photos, audio, notes, species, repeatable groups), which
  can also attach the scientific modules above.
- **Species catalog** per project, with GBIF and SpeciesLink search, import and
  export.
- **Maps**: view the collected points, attach a mapping layer and a field route
  (GeoJSON), and capture coordinates from the map or the device GPS.
- **Export** to CSV and GeoJSON, plus a media export that keeps the same folder
  layout as the collaboration and backup packages.
- **Collaboration without a server**: the project owner shares a configuration
  package, collaborators collect points and send a points package, and the
  owner reviews them in an approval queue (approve, reject, return a rejected
  point to the queue, resolve duplicates). A collector code identifies each
  collaborator.
- **Google Drive backup for the project owner**: on-demand backup that sends
  only what changed, with progress per item, an activity log, a pre-flight
  check and cancel; the field route and the map layers are included.
- **Restore** of the owner's project on another device from Drive.
- **Resources tab** with the link to the project page and the installed
  version, plus a status line that says whether it is the latest version
  (checked automatically, cached for 6 hours, never blocking the app).
- Four interface languages (Portuguese, English, Spanish, French) and light and
  dark themes; accessibility labels on icon-only buttons.

### Known limitations

- Backup and collaboration need a Google account (the `drive.file` scope only)
  and an internet connection; everything else works offline.
- Restoring a project needs connectivity for every file: if one download fails,
  the whole restore is undone (there is no partial or resumable restore).
- A photo that no longer exists on the device blocks the backup until the
  missing media is discarded from the point.
- Deletions are not mirrored on Drive: a deleted point or species stays in the
  Drive backup and a restore can bring it back.
- Restored points come back as approved; the original distinction between the
  owner's own points and approved collaborator points is not kept.
- The color, order and name of a map layer are not backed up. A route or
  layer file above 5 MB is not uploaded and is reported.
- There is no edit history and no conflict resolution: only one device can be
  the owner of a project.
- Collector codes (4 characters) are not checked for uniqueness between
  collaborators.
- The Drive flows were validated with automated tests and an in-memory Drive;
  they have not yet been validated at scale on real devices.
