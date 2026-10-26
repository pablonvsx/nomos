import { ACTIVITY_LOG_LIMIT, appendActivity, describeActivity, visibleActivity, type ActivityEvent } from "../activity-log";

const point = (n: number) => ({ kind: "point" as const, label: "", point: { number: n, lat: 0, lon: 0 } });
const start = (n: number): ActivityEvent => ({ type: "item-start", item: point(n) });

// A stand-in for the translator: shows the key and the params, so the test sees what each line asks for.
const t = (key: string, params?: Record<string, string>) =>
  key === "surveyView.point" ? "Ponto" : key.startsWith("driveBackup.item.unnamed") ? "Sem nome" : `${key} ${JSON.stringify(params ?? {})}`;

describe("appendActivity", () => {
  it("appends at the end and never mutates the log it was given", () => {
    const log: ActivityEvent[] = [start(1)];
    const next = appendActivity(log, start(2));
    expect(next.map((e) => (e.item.point as { number: number }).number)).toEqual([1, 2]);
    expect(log).toHaveLength(1);
  });

  it("keeps only the newest events beyond the limit (50 by default)", () => {
    let log: ActivityEvent[] = [];
    for (let i = 1; i <= ACTIVITY_LOG_LIMIT + 7; i++) log = appendActivity(log, start(i));
    expect(ACTIVITY_LOG_LIMIT).toBe(50);
    expect(log).toHaveLength(50);
    expect((log[0].item.point as { number: number }).number).toBe(8);
    expect((log[49].item.point as { number: number }).number).toBe(57);
  });

  it("honours a custom limit", () => {
    let log: ActivityEvent[] = [];
    for (let i = 1; i <= 5; i++) log = appendActivity(log, start(i), 3);
    expect(log).toHaveLength(3);
  });
});

describe("visibleActivity", () => {
  it("shows the last N events, oldest first", () => {
    let log: ActivityEvent[] = [];
    for (let i = 1; i <= 8; i++) log = appendActivity(log, start(i));
    expect(visibleActivity(log, 5).map((e) => (e.item.point as { number: number }).number)).toEqual([4, 5, 6, 7, 8]);
    expect(visibleActivity(log.slice(0, 2), 5)).toHaveLength(2);
    expect(visibleActivity(log, 0)).toEqual([]);
  });
});

describe("describeActivity", () => {
  it("names a point as the project's list does, and words each kind of event", () => {
    const item = point(2);
    expect(describeActivity({ type: "item-start", item }, t)).toContain('driveBackup.log.start {"name":"Ponto 2"}');
    expect(describeActivity({ type: "item-done", item }, t)).toContain("driveBackup.log.done");
    expect(describeActivity({ type: "item-failed", item }, t)).toContain("driveBackup.log.failed");
    expect(describeActivity({ type: "media", item, mediaKind: "photo", index: 2, total: 5 }, t)).toContain(
      'driveBackup.log.photo {"name":"Ponto 2","current":"2","total":"5"}',
    );
    expect(describeActivity({ type: "media", item, mediaKind: "audio", index: 1, total: 1 }, t)).toContain("driveBackup.log.audio");
  });

  it("names a species by its own name, with a plain fallback and never an id", () => {
    const named = describeActivity({ type: "item-start", item: { kind: "species", label: "Mimosa pudica" } }, t);
    expect(named).toContain("Mimosa pudica");
    const unnamed = describeActivity({ type: "item-start", item: { kind: "species", label: " " } }, t);
    expect(unnamed).toContain("Sem nome");
  });
});
