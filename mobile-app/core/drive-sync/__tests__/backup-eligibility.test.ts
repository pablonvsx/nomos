import { isBackupEligibleStatus } from "../backup-eligibility";

describe("isBackupEligibleStatus", () => {
  it.each([
    [null, true],
    [undefined, true],
    ["approved", true],
    ["pending", false],
    ["rejected", false],
  ])("%s -> %s", (status, expected) => {
    expect(isBackupEligibleStatus(status as string | null | undefined)).toBe(expected);
  });
});
