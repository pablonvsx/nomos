import type { ImportPointsResult } from "@/core/project-sharing/import-points";

/**
 * The owner's pass over the duplicates of one points import: what is still
 * undecided plus how the decisions went. It lives in the screen that opens
 * the duplicates modal, not in the modal itself - the screen reloads its data
 * after every decision, which remounts the modal, and a list kept inside it
 * came back whole.
 *
 * Pure and free of react/react-native so it runs under the node jest setup.
 */
export interface DuplicatesSession {
  result: ImportPointsResult;
  replaced: number;
  discarded: number;
}

export type DuplicateAction = "replace" | "discard";

export function createDuplicatesSession(result: ImportPointsResult): DuplicatesSession {
  return { result, replaced: 0, discarded: 0 };
}

/**
 * Drops the decided point (matched by its point_uuid) from the list and
 * counts the decision. An id that is not in the list changes nothing.
 */
export function resolveDuplicate(
  session: DuplicatesSession,
  pointId: string,
  action: DuplicateAction,
): DuplicatesSession {
  const remaining = session.result.duplicates.filter((d) => d.incoming.point_uuid !== pointId);
  if (remaining.length === session.result.duplicates.length) return session;
  return {
    result: { ...session.result, duplicates: remaining },
    replaced: session.replaced + (action === "replace" ? 1 : 0),
    discarded: session.discarded + (action === "discard" ? 1 : 0),
  };
}

export function isSessionResolved(session: DuplicatesSession): boolean {
  return session.result.duplicates.length === 0;
}

/**
 * Claims a point's decision. Returns false when that point already has one in
 * progress, so a second tap before the screen re-renders is ignored. The set
 * is a ref's content, checked synchronously - a disabled button only takes
 * effect after the next render.
 */
export function beginDecision(inFlight: Set<string>, pointId: string): boolean {
  if (inFlight.has(pointId)) return false;
  inFlight.add(pointId);
  return true;
}

export function endDecision(inFlight: Set<string>, pointId: string): void {
  inFlight.delete(pointId);
}
