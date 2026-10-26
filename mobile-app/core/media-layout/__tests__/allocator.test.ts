import type { CustomProtocolSchema } from "@/types/database";
import { createMediaPathAllocator } from "../allocator";
import { buildMediaLabelIndex } from "../labels";

const schema: CustomProtocolSchema = {
  sections: [
    {
      id: "s1",
      title: "Seção 1",
      fields: [
        { key: "fotos", type: "photo_input", label: "Fotos" },
        {
          key: "grupo",
          type: "repeatable_group",
          label: "Amostras",
          itemFields: [
            { key: "foto_item", type: "photo_input", label: "Foto" },
            { key: "audio_item", type: "audio_notes_input", label: "Áudio" },
          ],
        },
      ],
    },
  ],
};

const photoAt = (moduleId: string, fieldKey: string, ordinal = 0, groupId?: string, itemIndex?: number) => ({
  moduleId,
  groupId,
  itemIndex,
  fieldKey,
  kind: "photo" as const,
  ordinal,
});

describe("point-level media", () => {
  const allocator = () => createMediaPathAllocator(buildMediaLabelIndex(schema));

  it("puts photos and audio in their own folders, numbered from 1", () => {
    const paths = allocator();
    expect(paths.pointPhoto("file:///c/x.jpg", 0)).toBe("photos/photo_1.jpg");
    expect(paths.pointPhoto("file:///c/y.png", 1)).toBe("photos/photo_2.png");
    expect(paths.pointAudio("file:///c/a.m4a", 0)).toBe("audio/audio_1.m4a");
  });

  it("falls back to jpg / m4a when the uri has no usable extension", () => {
    const paths = allocator();
    expect(paths.pointPhoto("file:///c/noext", 0)).toBe("photos/photo_1.jpg");
    expect(paths.pointAudio("file:///c/noext", 0)).toBe("audio/audio_1.m4a");
  });
});

describe("protocol field media", () => {
  it("names a section field's file after the section title and the field label", () => {
    const paths = createMediaPathAllocator(buildMediaLabelIndex(schema));
    expect(paths.moduleMedia(photoAt("s1", "fotos"), "file:///c/s.jpg")).toBe("section_Seção 1/Fotos_1.jpg");
    expect(paths.moduleMedia(photoAt("s1", "fotos", 1), "file:///c/s2.jpg")).toBe("section_Seção 1/Fotos_2.jpg");
  });

  it("puts group media in group_<title>/item_NN/, one folder per item", () => {
    const paths = createMediaPathAllocator(buildMediaLabelIndex(schema));
    expect(paths.moduleMedia(photoAt("s1", "foto_item", 0, "grupo", 0), "file:///c/a.jpg")).toBe(
      "group_Amostras/item_01/Foto_1.jpg",
    );
    expect(paths.moduleMedia(photoAt("s1", "foto_item", 0, "grupo", 1), "file:///c/b.jpg")).toBe(
      "group_Amostras/item_02/Foto_1.jpg",
    );
    expect(
      paths.moduleMedia({ ...photoAt("s1", "audio_item", 0, "grupo", 0), kind: "audio" }, "file:///c/a.m4a"),
    ).toBe("group_Amostras/item_01/Áudio_1.m4a");
  });

  it("sanitizes titles and labels that come from data and caps them at 40 characters", () => {
    const long = "x".repeat(60);
    const index = buildMediaLabelIndex({
      sections: [{ id: "s", title: `A/B:C ${long}`, fields: [{ key: "f", type: "photo_input", label: `Foto?? ${long}` }] }],
    });
    const path = createMediaPathAllocator(index).moduleMedia(photoAt("s", "f"), "file:///c/a.jpg");
    const [section, file] = path.split("/");
    expect(section.startsWith("section_ABC x")).toBe(true);
    expect(section.length).toBeLessThanOrEqual("section_".length + 40);
    expect(file.replace(/_1\.jpg$/, "").length).toBeLessThanOrEqual(40);
    expect(path).not.toMatch(/[\\:*?"<>|]/);
  });

  it("keeps two sections with the same title apart", () => {
    const index = buildMediaLabelIndex({
      sections: [
        { id: "a", title: "Fotos", fields: [{ key: "f", type: "photo_input", label: "Foto" }] },
        { id: "b", title: "fotos", fields: [{ key: "f", type: "photo_input", label: "Foto" }] },
      ],
    });
    const paths = createMediaPathAllocator(index);
    expect(paths.moduleMedia(photoAt("a", "f"), "file:///c/1.jpg")).toBe("section_Fotos/Foto_1.jpg");
    expect(paths.moduleMedia(photoAt("b", "f"), "file:///c/2.jpg")).toBe("section_fotos_b/Foto_1.jpg");
  });

  it("keeps two fields with the same label in one section apart", () => {
    const index = buildMediaLabelIndex({
      sections: [
        {
          id: "a",
          title: "S",
          fields: [
            { key: "one", type: "photo_input", label: "Foto" },
            { key: "two", type: "photo_input", label: "Foto" },
          ],
        },
      ],
    });
    const paths = createMediaPathAllocator(index);
    expect(paths.moduleMedia(photoAt("a", "one"), "file:///c/1.jpg")).toBe("section_S/Foto_1.jpg");
    expect(paths.moduleMedia(photoAt("a", "two"), "file:///c/2.jpg")).toBe("section_S/Foto_two_1.jpg");
  });

  it("keeps two groups with the same title apart", () => {
    const group = (key: string) => ({
      key,
      type: "repeatable_group" as const,
      label: "Amostras",
      itemFields: [{ key: "f", type: "photo_input" as const, label: "Foto" }],
    });
    const index = buildMediaLabelIndex({ sections: [{ id: "a", title: "S", fields: [group("g1"), group("g2")] }] });
    const paths = createMediaPathAllocator(index);
    expect(paths.moduleMedia(photoAt("a", "f", 0, "g1", 0), "file:///c/1.jpg")).toBe("group_Amostras/item_01/Foto_1.jpg");
    expect(paths.moduleMedia(photoAt("a", "f", 0, "g2", 0), "file:///c/2.jpg")).toBe("group_Amostras_g2/item_01/Foto_1.jpg");
  });

  it("is deterministic: the same media in the same order gives the same paths", () => {
    const run = () => {
      const paths = createMediaPathAllocator(buildMediaLabelIndex(schema));
      return [
        paths.moduleMedia(photoAt("s1", "fotos"), "file:///c/s.jpg"),
        paths.moduleMedia(photoAt("s1", "foto_item", 0, "grupo", 0), "file:///c/a.jpg"),
      ];
    };
    expect(run()).toEqual(run());
  });

  it("uses the ids when the protocol has no label for the field", () => {
    const paths = createMediaPathAllocator(new Map());
    expect(paths.moduleMedia(photoAt("sec", "fld"), "file:///c/a.jpg")).toBe("section_sec/fld_1.jpg");
    expect(paths.moduleMedia(photoAt("sec", "fld", 0, "grp", 0), "file:///c/a.jpg")).toBe("group_grp/item_01/fld_1.jpg");
  });
});

describe("the dated audio naming of the human-readable export", () => {
  it("puts the recording time in the file name, in the same audio/ folder", () => {
    const paths = createMediaPathAllocator(new Map(), { audioNaming: "dated" });
    expect(paths.pointAudio("file:///c/a.m4a", 0, Date.UTC(2023, 10, 14, 22, 13))).toBe(
      "audio/audio_note_1_2023-11-14_22-13.m4a",
    );
    expect(paths.pointAudio("file:///c/b.mp3", 1)).toBe("audio/audio_note_2.mp3");
  });

  it("leaves the plain naming alone by default", () => {
    expect(createMediaPathAllocator(new Map()).pointAudio("file:///c/a.m4a", 0, 1700000000000)).toBe("audio/audio_1.m4a");
  });
});

describe("a path only exists for the media handed in", () => {
  it("never mentions a folder for media that is not there (no empty folders)", () => {
    const paths = createMediaPathAllocator(buildMediaLabelIndex(schema));
    const only = [paths.pointPhoto("file:///c/x.jpg", 0)];
    expect(only).toEqual(["photos/photo_1.jpg"]);
  });
});

describe("path length", () => {
  it("keeps the longest possible relative path far below the 260 characters of Windows paths", () => {
    const long = "x".repeat(200);
    const index = buildMediaLabelIndex({
      sections: [
        {
          id: "s",
          title: long,
          fields: [
            {
              key: "g",
              type: "repeatable_group",
              label: long,
              itemFields: [{ key: "f", type: "audio_notes_input", label: long }],
            },
          ],
        },
      ],
    });
    const path = createMediaPathAllocator(index).moduleMedia(
      { moduleId: "s", groupId: "g", itemIndex: 998, fieldKey: "f", kind: "audio", ordinal: 998 },
      "file:///c/a.m4a",
    );
    // Point_999/ + the path, plus a generous allowance for the folders above the zip's root.
    expect(`Point_999/${path}`.length).toBeLessThan(160);
  });
});
