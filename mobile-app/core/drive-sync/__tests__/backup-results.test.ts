import {
  classifyRun,
  failureFromReason,
  predominantReason,
  resultFromPointsSummary,
  type RunTally,
} from "../backup-results";
import type { BackupSummary } from "../backup-service";
import type { BackupFailure } from "../backup-session";

const failed = (overrides: Partial<BackupSummary["failed"][number]> = {}): BackupSummary["failed"][number] => ({
  pointId: 1,
  pointNumber: 1,
  lat: -8.05,
  lon: -34.9,
  reason: "Drive API error (403): userRateLimitExceeded",
  missingMediaCount: 0,
  timedOut: false,
  ...overrides,
});

const summary = (overrides: Partial<BackupSummary> = {}): BackupSummary => ({
  backedUp: 0,
  failed: [],
  cancelled: false,
  connectionLost: false,
  notAttempted: 0,
  ...overrides,
});

describe("resultFromPointsSummary", () => {
  it("is 'completed' only when nothing failed and nothing was left behind", () => {
    expect(resultFromPointsSummary(summary({ backedUp: 3 }))).toEqual({ outcome: "completed", sent: 3, notSent: 0, failures: [] });
  });

  it("is 'incomplete' when some points were sent and some failed, with a readable reason each", () => {
    const result = resultFromPointsSummary(summary({ backedUp: 2, failed: [failed()] }));
    expect(result).toMatchObject({ outcome: "incomplete", sent: 2, notSent: 1 });
    expect(result.failures[0]).toMatchObject({ kind: "point", point: { number: 1, lat: -8.05, lon: -34.9 }, reasonKey: "driveBackup.reason.quota", pointId: 1 });
  });

  it("is 'cancelled' with what was sent and what remains pending", () => {
    expect(resultFromPointsSummary(summary({ backedUp: 1, cancelled: true, notAttempted: 2 }))).toMatchObject({
      outcome: "cancelled",
      sent: 1,
      notSent: 2,
    });
  });
});

describe("failureFromReason", () => {
  it("reports media missing from the device with its count and keeps the point id for the discard offer", () => {
    expect(failureFromReason({ kind: "point", label: "" }, "Foto 1 não encontrada no dispositivo.", { missingMediaCount: 2, pointId: 7 })).toMatchObject({
      reasonKey: "driveBackup.reason.missingMedia",
      reasonParams: { count: "2" },
      pointId: 7,
      missingMediaCount: 2,
    });
  });

  it("flags a timeout without showing the technical text as the reason", () => {
    expect(failureFromReason({ kind: "point", label: "" }, "boom", { timedOut: true }).reasonKey).toBe("driveBackup.reason.timeout");
  });
});

const fail = (reasonKey: BackupFailure["reasonKey"], extras: Partial<BackupFailure> = {}): BackupFailure => ({
  kind: "species",
  label: "x",
  reasonKey,
  detail: `detail of ${reasonKey}`,
  ...extras,
});

const tally = (overrides: Partial<RunTally> = {}): RunTally => ({
  sent: 0,
  failures: [],
  notAttempted: 0,
  cancelled: false,
  connectionLost: false,
  ...overrides,
});

describe("classifyRun - the result states", () => {
  it("completed: everything pending was sent", () => {
    expect(classifyRun(tally({ sent: 3 }))).toMatchObject({ outcome: "completed", sent: 3, notSent: 0 });
  });

  it("completed with nothing to send is still completed (0 not sent)", () => {
    expect(classifyRun(tally())).toMatchObject({ outcome: "completed", sent: 0, notSent: 0 });
  });

  it("incomplete: at least one sent and at least one failed for its own reason", () => {
    expect(classifyRun(tally({ sent: 1, failures: [fail("driveBackup.reason.server")] }))).toMatchObject({
      outcome: "incomplete",
      sent: 1,
      notSent: 1,
    });
  });

  it("interrupted: the connection dropped after something was sent", () => {
    const result = classifyRun(
      tally({ sent: 2, failures: [fail("driveBackup.reason.offline")], notAttempted: 3, connectionLost: true }),
    );
    expect(result).toMatchObject({ outcome: "interrupted", sent: 2, notSent: 4 });
  });

  it("offline with nothing sent is the 'no connection' error, never incomplete", () => {
    const result = classifyRun(
      tally({ failures: [fail("driveBackup.reason.offline")], notAttempted: 2, connectionLost: true }),
    );
    expect(result.outcome).toBe("error");
    expect(result.error?.reasonKey).toBe("driveBackup.reason.offline");
  });

  it("cancelled: reports what was sent, wins over everything else", () => {
    expect(classifyRun(tally({ sent: 1, cancelled: true, notAttempted: 2, failures: [fail("driveBackup.reason.server")] }))).toMatchObject({
      outcome: "cancelled",
      sent: 1,
      notSent: 3,
    });
  });

  it("error: nothing sent because every item failed on its own, with the predominant reason", () => {
    const result = classifyRun(
      tally({ failures: [fail("driveBackup.reason.quota"), fail("driveBackup.reason.quota"), fail("driveBackup.reason.server")] }),
    );
    expect(result.outcome).toBe("error");
    expect(result.error?.reasonKey).toBe("driveBackup.reason.quota");
  });

  it("'0 sent' never lands under completed or incomplete when something was left unsent", () => {
    const reasons = ["driveBackup.reason.offline", "driveBackup.reason.timeout", "driveBackup.reason.server", "driveBackup.reason.missingMedia"] as const;
    for (const reason of reasons) {
      for (const connectionLost of [false, true]) {
        for (const cancelled of [false, true]) {
          for (const notAttempted of [0, 2]) {
            const result = classifyRun(tally({ failures: [fail(reason)], notAttempted, connectionLost, cancelled }));
            if (result.sent === 0 && result.notSent > 0) {
              expect(["completed", "incomplete"]).not.toContain(result.outcome);
            }
          }
        }
      }
    }
  });
});

describe("predominantReason", () => {
  it("is null without failures and picks the most frequent reason", () => {
    expect(predominantReason([])).toBeNull();
    expect(predominantReason([fail("driveBackup.reason.server"), fail("driveBackup.reason.quota"), fail("driveBackup.reason.quota")])?.reasonKey).toBe(
      "driveBackup.reason.quota",
    );
  });

  it("adds up the missing media counts", () => {
    const reason = predominantReason([
      fail("driveBackup.reason.missingMedia", { missingMediaCount: 2 }),
      fail("driveBackup.reason.missingMedia", { missingMediaCount: 3 }),
    ]);
    expect(reason).toEqual({ reasonKey: "driveBackup.reason.missingMedia", reasonParams: { count: "5" } });
  });
});
