# Privacy Policy — Nomos

Last updated: September 8th, 2026

Nomos is an open-source mobile application for geosystemic field surveys,
developed as part of academic research (PPGEO/UFPE, PAISAGEO research group).
This policy describes how the app handles personal data, with a focus on the
optional integration with a Google account.

## Data collected in the field

Field survey data (location, photos, notes, classifications) is stored
locally on the user's device, in a SQLite database. Nomos does not operate
its own server; no survey data is sent to the developer's infrastructure.

## Connecting a Google account (optional)

Using Nomos does not require a Google account. The connection is only needed
for the collaborative projects feature, and when enabled, the app requests:

- **Basic account identification** (name and email), used to identify members
  of a collaborative project.
- **Restricted access to Google Drive** (`drive.file` scope), which lets the
  app create, read, and update only the files and folders it creates within
  the user's own Google Drive. Nomos has no access to any other file in the
  user's Google account.

When this feature is used, project data (survey points, photos, and protocol
metadata) is sent directly from the user's device to the Google Drive of the
connected account (or of a project administrator, when shared with
collaborators), using Google's own infrastructure. The Nomos developer has no
access to this data once it is stored in users' Drive accounts.

## Data sharing

Nomos does not sell, rent, or share personal data with third parties for
advertising purposes. The only destinations for data are: local storage on
the user's own device, and the Google Drive of the account the user connects
(only when the collaborative feature is used).

## Retention and deletion

Local data can be deleted at any time by the user, either through the app
itself or by uninstalling it. Data saved to Google Drive can be deleted
directly through the Google Drive website or app, or by revoking Nomos's
access at myaccount.google.com/permissions.

## Contact

Questions about this policy can be sent to 11pabloguilherme@gmail.com, or
through the project's public repository:
https://github.com/pablonvsx/nomos
