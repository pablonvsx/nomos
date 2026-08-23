// Mask and validation for FieldRenderer's "date" (DD/MM/YYYY) and "time"
// (HH:MM) field types. Pure functions (no state/React) so they can be
// tested in isolation and reused by any controlled TextInput: they take
// the raw typed text and return the already-formatted text, rejecting
// two-digit groups that exceed the limit (day > 31, month > 12, hour > 23,
// minute > 59) instead of letting the user complete an invalid value.

function clampGroup(group: string, min: number, max: number): string {
  const n = parseInt(group, 10);
  if (n > max) return String(max).padStart(group.length, "0");
  if (n < min) return String(min).padStart(group.length, "0");
  return group;
}

/** Extracts only the digits from the typed text, capped to the final format's length. */
function extractDigits(raw: string, maxDigits: number): string {
  return raw.replace(/\D/g, "").slice(0, maxDigits);
}

/** Formats raw digits as DD/MM/YYYY, clamping day to 1-31 and month to 1-12 as soon as each group is complete. */
export function formatDateDigits(raw: string): string {
  const digits = extractDigits(raw, 8); // DDMMYYYY
  let day = digits.slice(0, 2);
  let month = digits.slice(2, 4);
  const year = digits.slice(4, 8);

  if (day.length === 2) day = clampGroup(day, 1, 31);
  if (month.length === 2) month = clampGroup(month, 1, 12);

  let out = day;
  if (digits.length > 2) out += `/${month}`;
  if (digits.length > 4) out += `/${year}`;
  return out;
}

/** Formats raw digits as HH:MM, clamping hour to 0-23 and minute to 0-59. */
export function formatTimeDigits(raw: string): string {
  const digits = extractDigits(raw, 4); // HHMM
  let hour = digits.slice(0, 2);
  let minute = digits.slice(2, 4);

  if (hour.length === 2) hour = clampGroup(hour, 0, 23);
  if (minute.length === 2) minute = clampGroup(minute, 0, 59);

  let out = hour;
  if (digits.length > 2) out += `:${minute}`;
  return out;
}

/**
 * Checks whether a complete date (DD/MM/YYYY) is a real calendar date -
 * clampGroup already prevents day > 31 / month > 12, but doesn't catch
 * combinations like 31/04 or 29/02 in a non-leap year. Incomplete dates
 * are considered valid (the user is still typing).
 */
export function isValidDateInput(formatted: string): boolean {
  const match = formatted.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return true;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}
