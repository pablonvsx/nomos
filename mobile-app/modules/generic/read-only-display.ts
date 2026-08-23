import type { SelectOption } from "@/protocol-kernel/types";

/** Renders a raw stored value (scalar or array) as plain, untranslated text; "-" when empty. */
export const displayValue = (value: any): string => {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "-";
  return String(value);
};

/**
 * Resolves a raw stored value (scalar or array, e.g. "clay_loam" or
 * ["leste", "norte"]) against a kernel SelectOption[] list, translating each
 * matched option's label to the current language; falls back to the raw
 * value itself when no match is found (mirrors displayValue's fallback).
 */
export const optionLabel = (
  options: SelectOption[] | undefined,
  value: unknown,
  translateField: (field: any) => string,
): string => {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) {
    if (value.length === 0) return "-";
    return value.map((v) => optionLabel(options, v, translateField)).join(", ");
  }
  const opt = options?.find((o) => o.value === value);
  return opt ? translateField(opt.label) : String(value);
};
