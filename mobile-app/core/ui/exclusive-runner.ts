/**
 * Pure core of hooks/use-exclusive-operation.ts: runs one task at a time and
 * ALWAYS releases the lock afterwards - on success, on a rejected promise and
 * on a synchronous throw - so a failing operation can never leave a screen
 * blocked. Free of react so it runs under the node jest setup.
 */

export interface OperationState {
  label: string;
  /** Optional "N of M" progress, shown as a bar. */
  current?: number;
  total?: number;
}

export type OperationUpdate = (progress: Partial<OperationState>) => void;

export interface ExclusiveRunner {
  run<T>(label: string, task: (update: OperationUpdate) => Promise<T>): Promise<T | undefined>;
}

/** `onChange` receives the running operation's state, or null once it is over. */
export function createExclusiveRunner(onChange: (state: OperationState | null) => void): ExclusiveRunner {
  let active = false;
  let current: OperationState | null = null;

  return {
    async run(label, task) {
      // A plain flag (not React state) guards re-entry so two taps in the
      // same frame can't both slip through before a re-render.
      if (active) return undefined;
      active = true;
      current = { label };
      onChange(current);
      try {
        return await task((progress) => {
          if (!current) return;
          current = { ...current, ...progress };
          onChange(current);
        });
      } finally {
        active = false;
        current = null;
        onChange(null);
      }
    },
  };
}
