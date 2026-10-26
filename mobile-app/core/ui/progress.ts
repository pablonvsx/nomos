// The progress bar of a run made of N items, driven by the item IN PROGRESS
// (not the ones already done): the first of 4 shows 1/4 while it uploads, so a
// bar never sits at 0% on a run that is working. Pure.

export interface ProgressPosition {
  /** 1-based position of the item being processed; 0 before the first one starts. */
  current: number;
  total: number;
}

/**
 * The fraction (0..1) to draw, or null when the bar should be indeterminate:
 * nothing started yet, or the total is not known. `finished` is the end of the
 * run, which is always a full bar. A failed item or a cancel is not an input
 * here, so neither can make the bar jump: it only follows `current`.
 */
export function getProgressFraction(position: ProgressPosition, finished = false): number | null {
  if (finished) return 1;
  if (position.total <= 0 || position.current <= 0) return null;
  return Math.min(1, position.current / position.total);
}

/**
 * Folds a new report into the previous one so the bar never moves backwards
 * within a run (a stage that reports a smaller position, or a late report out
 * of order). A different total is a different list: it is taken as it comes.
 */
export function advanceProgress(previous: ProgressPosition, next: ProgressPosition): ProgressPosition {
  if (next.total !== previous.total) return next;
  return { current: Math.max(previous.current, next.current), total: next.total };
}
