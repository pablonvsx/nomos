// Fields of the vegetation blob (moduleValues["vegetation"]) that the survey
// screen (app/(survey)/survey/form.tsx) owns and edits through its own cards,
// not VegetationModuleRenderer. The renderer is memoized on the fields it reads
// only, so the blob it spreads into every update can be older than the screen's
// state for exactly these keys: taking them from the renderer's update would
// bring back an old value (e.g. untick the homogeneity checkbox when a matrix
// cell is used). Pure.

export const FORM_OWNED_VEGETATION_KEYS = ["homogeneity_check", "conservation_status", "land_use"] as const;

/**
 * The vegetation blob after the renderer reported `next`: everything the
 * renderer owns comes from `next`, the form-owned keys come from `prev` (the
 * latest state). A form-owned key that `prev` does not have stays absent (e.g.
 * a land_use the screen cleared). Neither argument is modified.
 */
export function applyVegetationRendererUpdate(
  prev: Record<string, unknown> | undefined,
  next: unknown,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...((next ?? {}) as Record<string, unknown>) };
  for (const key of FORM_OWNED_VEGETATION_KEYS) delete merged[key];
  for (const key of FORM_OWNED_VEGETATION_KEYS) {
    if (prev && key in prev) merged[key] = prev[key];
  }
  return merged;
}
