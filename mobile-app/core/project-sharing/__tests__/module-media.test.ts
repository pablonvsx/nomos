import {
  PACKAGE_MEDIA_PREFIX,
  buildModuleMediaRelativePath,
  getModuleMediaFields,
  listModuleMediaUris,
  mapModuleMediaUris,
  type ModuleMediaField,
} from "../module-media";

// A custom protocol: one section with a top-level photo field and a
// repeatable_group whose items each have a photo and an audio field. The
// group also holds a text field and a (hand-edited, unsupported) nested
// group, neither of which may be treated as media.
const getCustomProtocolByIdMock = jest.fn();
jest.mock("@/db/queries/custom-protocols", () => ({
  getCustomProtocolById: (id: number) => getCustomProtocolByIdMock(id),
}));

const PROTOCOL = {
  id: 7,
  name: "Custom",
  theme: "t",
  schema: {
    sections: [
      {
        id: "section_1",
        title: "S1",
        fields: [
          { key: "fotos_topo", type: "photo_input", label: "Fotos" },
          { key: "texto", type: "text", label: "Texto" },
          {
            key: "grupo",
            type: "repeatable_group",
            label: "Grupo",
            itemFields: [
              { key: "foto_item", type: "photo_input", label: "Foto" },
              { key: "audio_item", type: "audio_notes_input", label: "Audio" },
              { key: "nome", type: "text", label: "Nome" },
              {
                key: "aninhado",
                type: "repeatable_group",
                label: "Nested (unsupported)",
                itemFields: [{ key: "foto_aninhada", type: "photo_input", label: "X" }],
              },
            ],
          },
        ],
      },
      { id: "shared", title: "Shared", moduleRef: "vegetation", fields: [] },
    ],
  },
};

beforeEach(() => {
  getCustomProtocolByIdMock.mockReset();
  getCustomProtocolByIdMock.mockResolvedValue(PROTOCOL);
});

const photo = (uri: string) => JSON.stringify([{ uri, timestamp: 1 }]);
const audio = (uri: string) => JSON.stringify([{ uri, duration: 3, timestamp: 2 }]);

describe("getModuleMediaFields", () => {
  it("returns top-level media fields AND the media sub-fields of repeatable groups, with their groupId", async () => {
    const fields = await getModuleMediaFields("7", "custom");

    expect(fields).toEqual([
      { moduleId: "section_1", fieldKey: "fotos_topo", kind: "photo" },
      { moduleId: "section_1", groupId: "grupo", fieldKey: "foto_item", kind: "photo" },
      { moduleId: "section_1", groupId: "grupo", fieldKey: "audio_item", kind: "audio" },
    ]);
  });

  it("only goes one level deep: media inside a nested group is not reported", async () => {
    const fields = await getModuleMediaFields("7", "custom");

    expect(fields.map((f) => f.fieldKey)).not.toContain("foto_aninhada");
  });

  it("official protocols carry no module media fields", async () => {
    expect(await getModuleMediaFields("nomos-paisageo-v1", "official")).toEqual([]);
  });
});

const FIELDS: ModuleMediaField[] = [
  { moduleId: "section_1", fieldKey: "fotos_topo", kind: "photo" },
  { moduleId: "section_1", groupId: "grupo", fieldKey: "foto_item", kind: "photo" },
  { moduleId: "section_1", groupId: "grupo", fieldKey: "audio_item", kind: "audio" },
];

function sampleData() {
  return {
    fotos_topo: photo("file:///d/top.jpg"),
    texto: "livre",
    grupo: [
      { foto_item: photo("file:///d/i0.jpg"), audio_item: audio("file:///d/i0.m4a"), nome: "A" },
      { foto_item: photo("file:///d/i1.jpg"), audio_item: audio("file:///d/i1.m4a"), nome: "B" },
    ],
  };
}

describe("mapModuleMediaUris - repeatable groups", () => {
  it("rewrites top-level media and the media of EVERY group item, passing the full location to the mapper", async () => {
    const locations: unknown[] = [];

    const result = await mapModuleMediaUris(JSON.stringify(sampleData()), FIELDS, (uri, location) => {
      locations.push({ uri, ...location });
      return `${PACKAGE_MEDIA_PREFIX}${uri.split("/").pop()}`;
    });

    const data = JSON.parse(result);
    expect(JSON.parse(data.fotos_topo)[0].uri).toBe("package-media:top.jpg");
    expect(JSON.parse(data.grupo[0].foto_item)[0].uri).toBe("package-media:i0.jpg");
    expect(JSON.parse(data.grupo[0].audio_item)[0].uri).toBe("package-media:i0.m4a");
    expect(JSON.parse(data.grupo[1].foto_item)[0].uri).toBe("package-media:i1.jpg");
    expect(JSON.parse(data.grupo[1].audio_item)[0].uri).toBe("package-media:i1.m4a");
    // Non-media values are untouched.
    expect(data.texto).toBe("livre");
    expect(data.grupo.map((i: { nome: string }) => i.nome)).toEqual(["A", "B"]);
    expect(locations).toContainEqual({
      uri: "file:///d/i1.m4a",
      moduleId: "section_1",
      groupId: "grupo",
      itemIndex: 1,
      fieldKey: "audio_item",
      kind: "audio",
      ordinal: 0,
    });
  });

  it("dropping a group media reference keeps the item and its other values", async () => {
    const result = await mapModuleMediaUris(JSON.stringify(sampleData()), FIELDS, (uri) =>
      uri.endsWith("i0.jpg") ? null : uri,
    );

    const data = JSON.parse(result);
    expect(data.grupo).toHaveLength(2);
    expect(JSON.parse(data.grupo[0].foto_item)).toEqual([]);
    expect(JSON.parse(data.grupo[0].audio_item)).toHaveLength(1);
    expect(data.grupo[0].nome).toBe("A");
  });

  it("keeps each value's shape: JSON text stays JSON text, a real array stays an array", async () => {
    const data = {
      grupo: [{ foto_item: [{ uri: "file:///d/a.jpg", timestamp: 1 }] }, { foto_item: photo("file:///d/b.jpg") }],
    };

    const result = JSON.parse(
      await mapModuleMediaUris(JSON.stringify(data), FIELDS, (uri) => `${PACKAGE_MEDIA_PREFIX}${uri.split("/").pop()}`),
    );

    expect(Array.isArray(result.grupo[0].foto_item)).toBe(true);
    expect(typeof result.grupo[1].foto_item).toBe("string");
  });

  it("data without the group key, or with empty / malformed items, is left alone (old data keeps working)", async () => {
    const noGroup = JSON.stringify({ fotos_topo: photo("file:///d/top.jpg") });
    const odd = JSON.stringify({ grupo: [null, "x", { nome: "sem midia" }, { foto_item: "not json" }] });

    const mapper = jest.fn((uri: string) => uri);
    expect(JSON.parse(await mapModuleMediaUris(noGroup, FIELDS, mapper)).grupo).toBeUndefined();
    expect(JSON.parse(await mapModuleMediaUris(odd, FIELDS, mapper))).toEqual(JSON.parse(odd));
    expect(mapper).toHaveBeenCalledTimes(1); // only the top-level photo of noGroup
  });
});

describe("listModuleMediaUris", () => {
  it("lists top-level and group media with kind, location and the original entry", async () => {
    const listed = await listModuleMediaUris(JSON.stringify(sampleData()), FIELDS);

    // Field by field (all items of one sub-field, then the next sub-field).
    expect(listed.map((m) => m.uri)).toEqual([
      "file:///d/top.jpg",
      "file:///d/i0.jpg",
      "file:///d/i1.jpg",
      "file:///d/i0.m4a",
      "file:///d/i1.m4a",
    ]);
    const lastAudio = listed[listed.length - 1];
    expect(lastAudio.kind).toBe("audio");
    expect(lastAudio.location).toMatchObject({ groupId: "grupo", itemIndex: 1, fieldKey: "audio_item" });
    expect(lastAudio.entry).toEqual({ uri: "file:///d/i1.m4a", duration: 3, timestamp: 2 });
  });
});

describe("buildModuleMediaRelativePath", () => {
  it("keeps the existing top-level format", () => {
    expect(
      buildModuleMediaRelativePath({ moduleId: "section_1", fieldKey: "fotos_topo" }, 3, "file:///d/top.jpg"),
    ).toBe("modules/section_1_3.jpg");
  });

  it("names group media after group, item and field, and never collides with other files of the same point", () => {
    const base = { moduleId: "section_1", groupId: "grupo" };
    const names = [
      buildModuleMediaRelativePath({ moduleId: "section_1", fieldKey: "fotos_topo" }, 1, "file:///d/a.jpg"),
      buildModuleMediaRelativePath({ ...base, itemIndex: 0, fieldKey: "foto_item" }, 2, "file:///d/b.jpg"),
      buildModuleMediaRelativePath({ ...base, itemIndex: 0, fieldKey: "audio_item" }, 3, "file:///d/c.m4a"),
      buildModuleMediaRelativePath({ ...base, itemIndex: 1, fieldKey: "foto_item" }, 4, "file:///d/d.jpg"),
      // Pathological: a module whose id looks like a group file name prefix.
      // The per-point counter is what keeps it distinct.
      buildModuleMediaRelativePath({ moduleId: "section_1_grupo_0_foto_item", fieldKey: "x" }, 5, "file:///d/e.jpg"),
    ];

    expect(names[1]).toBe("modules/section_1_grupo_0_foto_item_2.jpg");
    expect(new Set(names).size).toBe(names.length);
  });
});
