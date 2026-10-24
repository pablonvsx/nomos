import { failureFromReason, resultFromPointsSummary } from "../backup-results";
import type { BackupSummary } from "../backup-service";

const failed = (overrides: Partial<BackupSummary["failed"][number]> = {}): BackupSummary["failed"][number] => ({
  pointId: 1,
  pointLabel: "Ponto 1",
  reason: "Drive API error (403): userRateLimitExceeded",
  missingMediaCount: 0,
  timedOut: false,
  ...overrides,
});

describe("resultFromPointsSummary", () => {
  it("is 'completed' only when nothing failed and nothing was left behind", () => {
    expect(resultFromPointsSummary({ backedUp: 3, failed: [], cancelled: false, notAttempted: 0 })).toEqual({
      outcome: "completed",
      sent: 3,
      notSent: 0,
      failures: [],
    });
  });

  it("is 'completedWithPending' when some points failed, with a readable reason each", () => {
    const result = resultFromPointsSummary({ backedUp: 2, failed: [failed()], cancelled: false, notAttempted: 0 });
    expect(result.outcome).toBe("completedWithPending");
    expect(result.sent).toBe(2);
    expect(result.notSent).toBe(1);
    expect(result.failures[0]).toMatchObject({ label: "Ponto 1", reasonKey: "driveBackup.reason.quota", pointId: 1 });
  });

  it("is 'cancelled' with what was sent and what remains pending", () => {
    const result = resultFromPointsSummary({ backedUp: 1, failed: [], cancelled: true, notAttempted: 2 });
    expect(result).toMatchObject({ outcome: "cancelled", sent: 1, notSent: 2 });
  });
});

describe("failureFromReason", () => {
  it("reports media missing from the device with its count and keeps the point id for the discard offer", () => {
    expect(failureFromReason("P1", "Foto 1 não encontrada no dispositivo.", { missingMediaCount: 2, pointId: 7 })).toMatchObject({
      reasonKey: "driveBackup.reason.missingMedia",
      reasonParams: { count: "2" },
      pointId: 7,
      missingMediaCount: 2,
    });
  });

  it("flags a timeout without showing the technical text as the reason", () => {
    expect(failureFromReason("P1", "boom", { timedOut: true }).reasonKey).toBe("driveBackup.reason.timeout");
  });
});
