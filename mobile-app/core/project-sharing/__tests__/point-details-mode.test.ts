import { getPointDetailsMode } from "../point-details-mode";

describe("getPointDetailsMode", () => {
  it.each([
    // approval_status, role, expected mode
    ["pending", "owner", "review"],
    ["rejected", "owner", "readonly"],
    ["approved", "owner", "normal"],
    [null, "owner", "normal"],
    // A collaborator (or a plain local project) never reviews: the
    // pending/rejected states only exist on the owner's device, and the
    // review actions are an owner-only area.
    ["pending", "collaborator", "normal"],
    ["rejected", "collaborator", "normal"],
    ["pending", null, "normal"],
    ["rejected", undefined, "normal"],
    [null, "collaborator", "normal"],
    [null, null, "normal"],
  ] as const)("status %p + role %p => %s", (status, role, expected) => {
    expect(getPointDetailsMode(status, role)).toBe(expected);
  });

  it("treats a missing approval_status like a point collected on this device", () => {
    expect(getPointDetailsMode(undefined, "owner")).toBe("normal");
  });
});
