import {
  beginDecision,
  createDuplicatesSession,
  endDecision,
  isSessionResolved,
  resolveDuplicate,
} from "../duplicates-session";
import type { ImportPointsResult, PendingDuplicate } from "../import-points";

function duplicate(uuid: string, number: number): PendingDuplicate {
  return {
    incoming: { point_uuid: uuid, point_number: number } as PendingDuplicate["incoming"],
    existingPointId: number,
    stagedMediaDir: `pending_duplicates/${uuid}`,
    moduleMediaFields: [],
  };
}

function importResult(duplicates: PendingDuplicate[]): ImportPointsResult {
  return { imported: 2, duplicates, ownerEmailWarning: false, missingMedia: 0 };
}

describe("resolveDuplicate", () => {
  const session = createDuplicatesSession(
    importResult([duplicate("a", 1), duplicate("b", 2), duplicate("c", 3)]),
  );

  it("removes the resolved item and keeps the others in order", () => {
    const next = resolveDuplicate(session, "b", "replace");
    expect(next.result.duplicates.map((d) => d.incoming.point_uuid)).toEqual(["a", "c"]);
  });

  it("keeps the imported count and the rest of the import result", () => {
    const next = resolveDuplicate(session, "a", "discard");
    expect(next.result.imported).toBe(2);
    expect(next.result.ownerEmailWarning).toBe(false);
  });

  it("counts replaced and discarded separately", () => {
    let next = resolveDuplicate(session, "a", "replace");
    next = resolveDuplicate(next, "b", "discard");
    next = resolveDuplicate(next, "c", "discard");
    expect(next.replaced).toBe(1);
    expect(next.discarded).toBe(2);
  });

  it("empties the list when every item is resolved", () => {
    let next = session;
    for (const uuid of ["a", "b", "c"]) next = resolveDuplicate(next, uuid, "replace");
    expect(next.result.duplicates).toEqual([]);
    expect(isSessionResolved(next)).toBe(true);
    expect(isSessionResolved(session)).toBe(false);
  });

  it("ignores an id that is not in the list (no counter change)", () => {
    const next = resolveDuplicate(session, "zzz", "replace");
    expect(next).toBe(session);
  });

  it("does not mutate the previous session", () => {
    resolveDuplicate(session, "a", "replace");
    expect(session.result.duplicates).toHaveLength(3);
    expect(session.replaced).toBe(0);
  });
});

describe("beginDecision / endDecision", () => {
  it("lets the first tap through and ignores a second one on the same item", () => {
    const inFlight = new Set<string>();
    expect(beginDecision(inFlight, "a")).toBe(true);
    expect(beginDecision(inFlight, "a")).toBe(false);
  });

  it("does not block other items while one is in progress", () => {
    const inFlight = new Set<string>();
    beginDecision(inFlight, "a");
    expect(beginDecision(inFlight, "b")).toBe(true);
  });

  it("accepts the item again once its decision finished", () => {
    const inFlight = new Set<string>();
    beginDecision(inFlight, "a");
    endDecision(inFlight, "a");
    expect(beginDecision(inFlight, "a")).toBe(true);
  });
});
