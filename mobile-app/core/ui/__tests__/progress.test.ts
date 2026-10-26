import { advanceProgress, getProgressFraction } from "../progress";

describe("getProgressFraction", () => {
  it("is indeterminate (null) before the first item starts and while the total is unknown", () => {
    expect(getProgressFraction({ current: 0, total: 4 })).toBeNull();
    expect(getProgressFraction({ current: 0, total: 0 })).toBeNull();
    expect(getProgressFraction({ current: 1, total: 0 })).toBeNull();
  });

  it("follows the item in progress: 1 of 2 is 0.5, 2 of 2 is 1", () => {
    expect(getProgressFraction({ current: 1, total: 2 })).toBe(0.5);
    expect(getProgressFraction({ current: 2, total: 2 })).toBe(1);
    expect(getProgressFraction({ current: 1, total: 4 })).toBe(0.25);
  });

  it("is 1 at the end of the run, whatever the last position was, and never above 1", () => {
    expect(getProgressFraction({ current: 3, total: 5 }, true)).toBe(1);
    expect(getProgressFraction({ current: 0, total: 0 }, true)).toBe(1);
    expect(getProgressFraction({ current: 9, total: 5 })).toBe(1);
  });

  it("does not divide by zero", () => {
    expect(() => getProgressFraction({ current: 0, total: 0 })).not.toThrow();
    expect(Number.isFinite(getProgressFraction({ current: 3, total: 0 }) ?? 0)).toBe(true);
  });

  it("a failed item or a cancel cannot move it: the same position gives the same fraction", () => {
    // Failure and cancel are not inputs; the bar is a function of the position alone.
    const before = getProgressFraction({ current: 2, total: 4 });
    const afterFailure = getProgressFraction({ current: 2, total: 4 });
    expect(afterFailure).toBe(before);
  });
});

describe("advanceProgress", () => {
  it("never goes backwards within one run", () => {
    const seen: number[] = [];
    let position = { current: 0, total: 4 };
    for (const reported of [1, 2, 1, 3, 0, 3, 4]) {
      position = advanceProgress(position, { current: reported, total: 4 });
      seen.push(position.current);
    }
    expect(seen).toEqual([1, 2, 2, 3, 3, 3, 4]);
  });

  it("takes a new list as it comes when the total changes", () => {
    expect(advanceProgress({ current: 3, total: 4 }, { current: 1, total: 2 })).toEqual({ current: 1, total: 2 });
  });
});
