import { describeBackupError } from "../backup-errors";
import { DriveTimeoutError } from "../drive-errors";

describe("describeBackupError", () => {
  it("maps a timeout", () => {
    expect(describeBackupError(new DriveTimeoutError(30_000)).key).toBe("driveBackup.reason.timeout");
  });

  it("maps Drive HTTP errors to a friendly reason and keeps the technical text as detail", () => {
    const unauthorized = describeBackupError(new Error('Drive API error (401): {"error":"invalid"}'));
    expect(unauthorized.key).toBe("driveBackup.reason.auth");
    expect(unauthorized.detail).toContain("Drive API error (401)");

    expect(describeBackupError(new Error("Drive API error (403): forbidden")).key).toBe("driveBackup.reason.auth");
    expect(describeBackupError(new Error("Drive API error (403): userRateLimitExceeded")).key).toBe(
      "driveBackup.reason.quota",
    );
    expect(describeBackupError(new Error("Drive API error (429): slow down")).key).toBe("driveBackup.reason.quota");
    expect(describeBackupError(new Error("Drive API error (404): not found")).key).toBe(
      "driveBackup.reason.folderMissing",
    );
    expect(describeBackupError(new Error("Drive API error (503): backend")).key).toBe("driveBackup.reason.server");
  });

  it("maps connection failures and sign-in library messages", () => {
    expect(describeBackupError(new Error("Network request failed")).key).toBe("driveBackup.reason.offline");
    expect(
      describeBackupError(
        new Error("PGMN-2: previous promise did not settle and was overwritten. You've called getTokens while getTokens was already in progress"),
      ).key,
    ).toBe("driveBackup.reason.auth");
  });

  it("falls back to an unknown reason without hiding the detail", () => {
    const reason = describeBackupError("something odd");
    expect(reason.key).toBe("driveBackup.reason.unknown");
    expect(reason.detail).toBe("something odd");
  });
});
