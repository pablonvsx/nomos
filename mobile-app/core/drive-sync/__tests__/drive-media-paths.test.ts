jest.mock("@/db/queries/custom-protocols", () => ({ getCustomProtocolById: jest.fn() }));

import { fromDriveMediaMarker, splitRelativePath, toDriveMediaMarker } from "../drive-media-paths";

describe("markers", () => {
  it("carries the full relative path after package-media:", () => {
    const marker = toDriveMediaMarker("media/group_A/item_01/Foto_1.jpg");
    expect(marker).toBe("package-media:media/group_A/item_01/Foto_1.jpg");
    expect(fromDriveMediaMarker(marker)).toBe("media/group_A/item_01/Foto_1.jpg");
  });

  it("returns null for a value that is not a marker", () => {
    expect(fromDriveMediaMarker("file:///x.jpg")).toBeNull();
  });

  it("splits a relative path into its segments", () => {
    expect(splitRelativePath("media/group_A/item_01/Foto_1.jpg")).toEqual(["media", "group_A", "item_01", "Foto_1.jpg"]);
  });
});
