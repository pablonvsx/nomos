import {
  APPROVED_FOLDER,
  MAX_NAME_LENGTH,
  MEDIA_FOLDER,
  POINT_JSON_FILENAME,
  itemFolderName,
  parsePointFolderUuid,
  pointFolderLabel,
  pointFolderName,
  sanitizeDriveName,
  uniqueDriveName,
} from "../drive-layout";

const UUID = "3f2b8c1e-5d4a-4b6e-9a1f-0c7d2e8b4a56";

describe("fixed names", () => {
  it("are lowercase English, like the names already on Drive", () => {
    expect(APPROVED_FOLDER).toBe("approved");
    expect(MEDIA_FOLDER).toBe("media");
    expect(POINT_JSON_FILENAME).toBe("point.json");
  });
});

describe("sanitizeDriveName", () => {
  it("removes the characters Drive and file systems dislike", () => {
    expect(sanitizeDriveName('a/b\\c:d*e?f"g<h>i|j')).toBe("abcdefghij");
  });

  it("collapses repeated whitespace and trims", () => {
    expect(sanitizeDriveName("  Fotos   da \t área  ")).toBe("Fotos da área");
  });

  it("keeps accents", () => {
    expect(sanitizeDriveName("Áudio do item")).toBe("Áudio do item");
  });

  it("limits names to 40 characters without leaving a trailing space", () => {
    expect(MAX_NAME_LENGTH).toBe(40);
    const sanitized = sanitizeDriveName(`${"a".repeat(39)} bbbbbbbbbb`);
    expect(sanitized.length).toBeLessThanOrEqual(40);
    expect(sanitized.endsWith(" ")).toBe(false);
  });

  it("falls back to a neutral name, never to a question mark", () => {
    expect(sanitizeDriveName('/\\:*?"<>|')).toBe("unnamed");
    expect(sanitizeDriveName("   ")).toBe("unnamed");
  });
});

describe("uniqueDriveName", () => {
  it("returns the base name when free and remembers it", () => {
    const taken = new Set<string>();
    expect(uniqueDriveName("Fotos", "k", taken)).toBe("Fotos");
    expect(taken.has("fotos")).toBe(true);
  });

  it("appends the key on a collision, then a counter", () => {
    const taken = new Set<string>();
    uniqueDriveName("Fotos", "k", taken);
    expect(uniqueDriveName("Fotos", "k", taken)).toBe("Fotos_k");
    expect(uniqueDriveName("Fotos", "k", taken)).toBe("Fotos_k_2");
    expect(uniqueDriveName("Fotos", "k", taken)).toBe("Fotos_k_3");
  });

  it("treats names that differ only by case as the same", () => {
    const taken = new Set<string>();
    uniqueDriveName("Fotos", "a", taken);
    expect(uniqueDriveName("fotos", "b", taken)).toBe("fotos_b");
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

describe("itemFolderName", () => {
  it("is 1-based and zero padded", () => {
    expect(itemFolderName(0)).toBe("item_01");
    expect(itemFolderName(9)).toBe("item_10");
    expect(itemFolderName(99)).toBe("item_100");
  });
});
