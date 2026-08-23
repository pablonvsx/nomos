import type { ContextFlag } from "@/modules/paisageo/services/vegetation_classifier";

/**
 * Simplified stratum for export: pre-joined fields as strings.
 * The `vegetation_strata` key matches the schema's dynamic group's
 * `groupId` — the column engine uses `data[groupId]` to locate the array.
 */
export interface VegetationStratum {
  height_id?: string;      // Küchler height-class code (e.g. "8" for >35m)
  height_range: string;
  life_form: string;       // life forms joined by "; "
  cover_class: string;     // cover classes joined by "; "
  leaf_adaptation: string; // leaf adaptations joined by "; " (filtered)
}

export interface VegetationModuleData {
  // Formula and classification (exportable)
  raw_formula?: string;
  kuchler_formula?: string;
  total_strata?: number;
  physiognomy_name?: string;
  classification_group?: string;
  classification_type?: string;
  description_text?: string;

  // Conservation status
  conservation_status?: string;
  land_use?: string;

  // Free-text physiognomy complement, and the chosen class when the project
  // uses custom vegetation classification (instead of automatic).
  // They live here (point-level data), not as state external to the module.
  physiognomy_complement?: string;
  custom_class_id?: string;

  // Landscape-unit homogeneity confirmation (top-of-form field,
  // persisted here for convenience since it doesn't belong to any scientific module)
  homogeneity_check?: boolean;

  // Context flags that the raw formula alone can't derive
  // (mangrove, spiny, semi-lignified) — feed classifyVegetation
  // via processKuchlerMatrix, see KuchlerMatrix.tsx.
  context_flags?: ContextFlag[];

  // KuchlerMatrix internal state (not exported, for re-rendering)
  matrix?: Record<string, Record<string, string>>;
  leaf_matrix?: Record<string, string>;

  // Dynamic group — key aligned with the schema's groupId
  vegetation_strata?: VegetationStratum[];
}

export function serializeVegetation(data: unknown): string {
  return JSON.stringify(data);
}

export function deserializeVegetation(raw: string): unknown {
  return JSON.parse(raw);
}
