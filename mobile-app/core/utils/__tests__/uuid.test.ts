let counter = 0;

jest.mock("expo-crypto", () => ({
  randomUUID: () => {
    counter += 1;
    // Deterministic but RFC4122 v4-shaped fake UUID, distinct per call.
    const hex = counter.toString(16).padStart(12, "0");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4000-8000-${hex.padEnd(12, "0")}`;
  },
}));

import { generateUuid } from "../uuid";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("generateUuid", () => {
  it("returns a value matching the UUID v4 format", () => {
    expect(generateUuid()).toMatch(UUID_V4_PATTERN);
  });

  it("returns a different value on every call", () => {
    const a = generateUuid();
    const b = generateUuid();
    expect(a).not.toBe(b);
  });
});
