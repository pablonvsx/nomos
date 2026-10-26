import {
  APPROVED_FOLDER,
  MEDIA_FOLDER,
  POINT_JSON_FILENAME,
  parsePointFolderUuid,
  pointFolderLabel,
  pointFolderName,
} from "../drive-layout";

const UUID = "3f2b8c1e-5d4a-4b6e-9a1f-0c7d2e8b4a56";

describe("fixed names", () => {
  it("are lowercase English, like the names already on Drive", () => {
    expect(APPROVED_FOLDER).toBe("approved");
    expect(MEDIA_FOLDER).toBe("media");
    expect(POINT_JSON_FILENAME).toBe("point.json");
  });
});

describe("point folder names", () => {
  it("labels a point with its collector code and number", () => {
    expect(pointFolderLabel({ created_by: "ABCD", point_number: 3 })).toBe("ABCD-3");
  });

  it("uses just the number when the point has no collector code - never a question mark", () => {
    expect(pointFolderLabel({ created_by: null, point_number: 3 })).toBe("3");
    expect(pointFolderLabel({ created_by: "", point_number: 3 })).toBe("3");
    expect(pointFolderName(pointFolderLabel({ created_by: null, point_number: 3 }), UUID)).toBe(`point_3_${UUID}`);
  });

  it("builds point_<label>_<uuid> and sanitizes the label only", () => {
    expect(pointFolderName("ABCD-3", UUID)).toBe(`point_ABCD-3_${UUID}`);
    expect(pointFolderName("A/B:C", UUID)).toBe(`point_ABC_${UUID}`);
  });

  it("parses the uuid back out, even from an upper-case or underscored label", () => {
    expect(parsePointFolderUuid(`point_ABCD-3_${UUID}`)).toBe(UUID);
    expect(parsePointFolderUuid(`point_AB_CD-3_${UUID}`)).toBe(UUID);
    expect(parsePointFolderUuid(`point_3_${UUID.toUpperCase()}`)).toBe(UUID.toUpperCase());
  });

  it("reads the identity from the suffix, so a renamed label still parses", () => {
    expect(parsePointFolderUuid(`point_renamed by someone_${UUID}`)).toBe(UUID);
  });

  it.each([
    "approved",
    "media",
    "point.json",
    "point_",
    "point_3_not-a-uuid",
    `point_${UUID}`,
    `${UUID}.json`,
    `Point_3_${UUID}`,
    `notes_3_${UUID}`,
    "",
  ])("returns null for a folder that is not a point folder: %p", (name) => {
    expect(parsePointFolderUuid(name)).toBeNull();
  });
});
