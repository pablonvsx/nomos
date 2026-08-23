export type JsonValidator<T> = (value: unknown) => value is T;

export function parseJsonText<T>(
  rawValue: unknown,
  fallback: T,
  validator?: JsonValidator<T>,
): T {
  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    return fallback;
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;

    if (validator && !validator(parsed)) {
      return fallback;
    }

    return parsed as T;
  } catch {
    return fallback;
  }
}

export function ensureJsonText(rawValue: unknown, fallback: string): string {
  if (typeof rawValue !== "string" || rawValue.trim() === "") {
    return fallback;
  }

  try {
    JSON.parse(rawValue);
    return rawValue;
  } catch {
    return fallback;
  }
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/**
 * Extracts valid URIs from a photo list - accepts both the current format
 * ({uri, timestamp}[], produced by components/media/PhotoInput.tsx) and the
 * legacy one (string[] of plain uris), and both already-deserialized (array)
 * and still as a raw JSON string (points.photos column or a photo_input
 * field's value inside a module's JSON). Single source of truth for this
 * conversion - reused by the export mapper and the detail screen.
 */
export function parsePhotoUris(rawValue: unknown): string[] {
  const arr =
    typeof rawValue === "string"
      ? parseJsonText<unknown[]>(rawValue, [], Array.isArray)
      : Array.isArray(rawValue)
        ? rawValue
        : [];

  return arr
    .map((item) => (typeof item === "string" ? item : (item as { uri?: unknown })?.uri))
    .filter((uri): uri is string => typeof uri === "string" && uri.length > 0);
}
