import { useMemo, useState } from "react";
import { createExclusiveRunner, type OperationState } from "@/core/ui/exclusive-runner";

export type { OperationState, OperationUpdate } from "@/core/ui/exclusive-runner";

/**
 * Runs one long operation (network / file work) at a time: re-entry while one
 * is running is ignored (no double taps), `operation` drives a visible
 * loading banner, and the lock is always released (see exclusive-runner.ts).
 */
export function useExclusiveOperation() {
  const [operation, setOperation] = useState<OperationState | null>(null);
  const runner = useMemo(() => createExclusiveRunner(setOperation), []);

  return { operation, busy: operation !== null, run: runner.run };
}
