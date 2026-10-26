import {
  MAX_NAME_LENGTH,
  extensionOf,
  groupFolderName,
  itemFolderName,
  recordingTimeTag,
  sanitizeName,
  sectionFolderName,
  uniqueName,
} from "../names";

describe("sanitizeName", () => {
  it("removes the characters Drive and file systems dislike", () => {
    expect(sanitizeName('a/b\\c:d*e?f"g<h>i|j')).toBe("abcdefghij");
  });

  it("collapses repeated whitespace and trims", () => {
    expect(sanitizeName("  Fotos   da \t área  ")).toBe("Fotos da área");
  });

  it("keeps accents", () => {
    expect(sanitizeName("Áudio do item")).toBe("Áudio do item");
  });

  it("limits names to 40 characters without leaving a trailing space", () => {
    expect(MAX_NAME_LENGTH).toBe(40);
    const sanitized = sanitizeName(`${"a".repeat(39)} bbbbbbbbbb`);
    expect(sanitized.length).toBeLessThanOrEqual(40);
    expect(sanitized.endsWith(" ")).toBe(false);
  });

  it("falls back to a neutral name, never to a question mark", () => {
    expect(sanitizeName('/\\:*?"<>|')).toBe("unnamed");
    expect(sanitizeName("   ")).toBe("unnamed");
  });
});

describe("uniqueName", () => {
  it("returns the base name when free and remembers it", () => {
    const taken = new Set<string>();
    expect(uniqueName("Fotos", "k", taken)).toBe("Fotos");
    expect(taken.has("fotos")).toBe(true);
  });

  it("appends the key on a collision, then a counter", () => {
    const taken = new Set<string>();
    uniqueName("Fotos", "k", taken);
    expect(uniqueName("Fotos", "k", taken)).toBe("Fotos_k");
    expect(uniqueName("Fotos", "k", taken)).toBe("Fotos_k_2");
    expect(uniqueName("Fotos", "k", taken)).toBe("Fotos_k_3");
  });

  it("treats names that differ only by case as the same", () => {
    const taken = new Set<string>();
    uniqueName("Fotos", "a", taken);
    expect(uniqueName("fotos", "b", taken)).toBe("fotos_b");
  });
});

describe("itemFolderName", () => {
  it("is 1-based and zero padded", () => {
    expect(itemFolderName(0)).toBe("item_01");
    expect(itemFolderName(9)).toBe("item_10");
    expect(itemFolderName(99)).toBe("item_100");
  });
});

describe("section and group folder names", () => {
  it("prefix the sanitized title", () => {
    expect(sectionFolderName("Seção: A/B")).toBe("section_Seção AB");
    expect(groupFolderName("Amostras")).toBe("group_Amostras");
  });
});

describe("extensionOf", () => {
  it("returns the extension, or the fallback when there is none", () => {
    expect(extensionOf("file:///c/a.JPG", "jpg")).toBe("JPG");
    expect(extensionOf("file:///c/noext", "jpg")).toBe("jpg");
    expect(extensionOf("file:///c.dir/noext", "jpg")).toBe("jpg");
  });
});

describe("recordingTimeTag", () => {
  it("formats the time as date_hour-minute, and is empty without a timestamp", () => {
    expect(recordingTimeTag(Date.UTC(2023, 10, 14, 22, 13))).toBe("2023-11-14_22-13");
    expect(recordingTimeTag(undefined)).toBe("");
  });
});
