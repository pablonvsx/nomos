export interface PointLabelInput {
  pointNumber: number;
  createdBy: string | null;
}

export interface ProjectMemberLite {
  email: string;
  collector_code: string;
}

export function getPointDisplayLabel(
  point: PointLabelInput,
  isCollaborative: boolean,
  members: ProjectMemberLite[]
): string {
  if (!isCollaborative || !point.createdBy) return String(point.pointNumber);
  const member = members.find((m) => m.email === point.createdBy);
  if (!member) return String(point.pointNumber);
  return `${member.collector_code}-${point.pointNumber}`;
}

// Converts local project_members rows (collector_code possibly null, e.g.
// legacy rows synced before this field existed) into the lean shape
// getPointDisplayLabel expects. A member without a code simply falls out of
// the list, which getPointDisplayLabel already treats as "fall back to the
// raw number".
export function toMemberLiteList(
  members: { member_email: string; collector_code: string | null }[]
): ProjectMemberLite[] {
  return members
    .filter((m): m is typeof m & { collector_code: string } => !!m.collector_code)
    .map((m) => ({ email: m.member_email, collector_code: m.collector_code }));
}

// Drive folder/file names for a point combine a human-readable label with
// the point's own (immutable) UUID, separated by "__" - readable enough to
// identify the point at a glance in Drive, but still uniquely and reliably
// matchable by UUID regardless of the label ever changing (point renamed,
// collector code changed) or colliding with another point's label.
const DRIVE_NAME_SEPARATOR = '__';
const MAX_LABEL_SEGMENT_LENGTH = 60;

// Strips characters that are unsafe/confusing in a Drive name, collapses
// whitespace/underscore runs (so DRIVE_NAME_SEPARATOR - "__" - can never
// appear inside a label we built), and caps length.
function sanitizeDriveNameSegment(text: string): string {
  return text
    .replace(/[/\\]/g, '-')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, MAX_LABEL_SEGMENT_LENGTH);
}

// Same numbering shown to the user everywhere else in the app
// (getPointDisplayLabel) plus the point's own name, so the Drive prefix is
// recognizable at a glance: "AB-3_Trilha_do_Riacho".
export function buildPointDriveLabel(
  pointNumber: number,
  generatedName: string | null | undefined,
  collectorCode: string | null | undefined,
): string {
  const numberLabel = collectorCode ? `${collectorCode}-${pointNumber}` : String(pointNumber);
  const nameSegment = generatedName ? sanitizeDriveNameSegment(generatedName) : '';
  return nameSegment ? `${numberLabel}_${nameSegment}` : numberLabel;
}

export function buildPointFolderName(label: string, pointUuid: string): string {
  return `${label}${DRIVE_NAME_SEPARATOR}${pointUuid}`;
}

export function buildPointFileName(label: string, pointUuid: string): string {
  return `${buildPointFolderName(label, pointUuid)}.json`;
}

// Recovers the point's UUID from a Drive folder/file name, whether it's the
// new "<label>__<uuid>[.json]" scheme or a pre-existing bare "<uuid>[.json]"
// name from before human-readable labels existed - no migration needed.
export function extractPointUuidFromName(name: string): string {
  const withoutExtension = name.endsWith('.json') ? name.slice(0, -'.json'.length) : name;
  const separatorIndex = withoutExtension.lastIndexOf(DRIVE_NAME_SEPARATOR);
  return separatorIndex === -1
    ? withoutExtension
    : withoutExtension.slice(separatorIndex + DRIVE_NAME_SEPARATOR.length);
}
