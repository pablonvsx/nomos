jest.mock("@/db/queries/custom-protocols", () => ({ getCustomProtocolById: jest.fn() }));

import type { CustomProtocolSchema } from "@/types/database";
import {
  buildMediaLabelIndex,
  createDriveMediaPathAllocator,
  toDriveMediaMarker,
  fromDriveMediaMarker,
  splitRelativePath,
} from "../drive-media-paths";

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
  const allocator = () => createDriveMediaPathAllocator(buildMediaLabelIndex(schema));

  it("puts photos and audio in their own folders, numbered from 1", () => {
    const paths = allocator();
    expect(paths.pointPhoto("file:///c/x.jpg", 0)).toBe("media/photos/photo_1.jpg");
    expect(paths.pointPhoto("file:///c/y.png", 1)).toBe("media/photos/photo_2.png");
    expect(paths.pointAudio("file:///c/a.m4a", 0)).toBe("media/audio/audio_1.m4a");
  });

  it("falls back to jpg / m4a when the uri has no usable extension", () => {
    const paths = allocator();
    expect(paths.pointPhoto("file:///c/noext", 0)).toBe("media/photos/photo_1.jpg");
    expect(paths.pointAudio("file:///c/noext", 0)).toBe("media/audio/audio_1.m4a");
  });
});

describe("protocol field media", () => {
  it("names a section field's file after the section title and the field label", () => {
    const paths = createDriveMediaPathAllocator(buildMediaLabelIndex(schema));
    expect(paths.moduleMedia(photoAt("s1", "fotos"), "file:///c/s.jpg")).toBe("media/section_Seção 1/Fotos_1.jpg");
    expect(paths.moduleMedia(photoAt("s1", "fotos", 1), "file:///c/s2.jpg")).toBe("media/section_Seção 1/Fotos_2.jpg");
  });

  it("puts group media in group_<title>/item_NN/, one folder per item", () => {
    const paths = createDriveMediaPathAllocator(buildMediaLabelIndex(schema));
    expect(paths.moduleMedia(photoAt("s1", "foto_item", 0, "grupo", 0), "file:///c/a.jpg")).toBe(
      "media/group_Amostras/item_01/Foto_1.jpg",
    );
    expect(paths.moduleMedia(photoAt("s1", "foto_item", 0, "grupo", 1), "file:///c/b.jpg")).toBe(
      "media/group_Amostras/item_02/Foto_1.jpg",
    );
    expect(
      paths.moduleMedia({ ...photoAt("s1", "audio_item", 0, "grupo", 0), kind: "audio" }, "file:///c/a.m4a"),
    ).toBe("media/group_Amostras/item_01/Áudio_1.m4a");
  });

  it("sanitizes titles and labels that come from data and caps them at 40 characters", () => {
    const long = "x".repeat(60);
    const index = buildMediaLabelIndex({
      sections: [{ id: "s", title: `A/B:C ${long}`, fields: [{ key: "f", type: "photo_input", label: `Foto?? ${long}` }] }],
    });
    const path = createDriveMediaPathAllocator(index).moduleMedia(photoAt("s", "f"), "file:///c/a.jpg");
    const [media, section, file] = path.split("/");
    expect(media).toBe("media");
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
    const paths = createDriveMediaPathAllocator(index);
    expect(paths.moduleMedia(photoAt("a", "f"), "file:///c/1.jpg")).toBe("media/section_Fotos/Foto_1.jpg");
    expect(paths.moduleMedia(photoAt("b", "f"), "file:///c/2.jpg")).toBe("media/section_fotos_b/Foto_1.jpg");
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
    const paths = createDriveMediaPathAllocator(index);
    expect(paths.moduleMedia(photoAt("a", "one"), "file:///c/1.jpg")).toBe("media/section_S/Foto_1.jpg");
    expect(paths.moduleMedia(photoAt("a", "two"), "file:///c/2.jpg")).toBe("media/section_S/Foto_two_1.jpg");
  });

  it("keeps two groups with the same title apart", () => {
    const group = (key: string) => ({
      key,
      type: "repeatable_group" as const,
      label: "Amostras",
      itemFields: [{ key: "f", type: "photo_input" as const, label: "Foto" }],
    });
    const index = buildMediaLabelIndex({ sections: [{ id: "a", title: "S", fields: [group("g1"), group("g2")] }] });
    const paths = createDriveMediaPathAllocator(index);
    expect(paths.moduleMedia(photoAt("a", "f", 0, "g1", 0), "file:///c/1.jpg")).toBe("media/group_Amostras/item_01/Foto_1.jpg");
    expect(paths.moduleMedia(photoAt("a", "f", 0, "g2", 0), "file:///c/2.jpg")).toBe("media/group_Amostras_g2/item_01/Foto_1.jpg");
  });

  it("is deterministic: the same media in the same order gives the same paths", () => {
    const run = () => {
      const paths = createDriveMediaPathAllocator(buildMediaLabelIndex(schema));
      return [
        paths.moduleMedia(photoAt("s1", "fotos"), "file:///c/s.jpg"),
        paths.moduleMedia(photoAt("s1", "foto_item", 0, "grupo", 0), "file:///c/a.jpg"),
      ];
    };
    expect(run()).toEqual(run());
  });

  it("uses the ids when the protocol has no label for the field", () => {
    const paths = createDriveMediaPathAllocator(new Map());
    expect(paths.moduleMedia(photoAt("sec", "fld"), "file:///c/a.jpg")).toBe("media/section_sec/fld_1.jpg");
    expect(paths.moduleMedia(photoAt("sec", "fld", 0, "grp", 0), "file:///c/a.jpg")).toBe("media/group_grp/item_01/fld_1.jpg");
  });
});

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
