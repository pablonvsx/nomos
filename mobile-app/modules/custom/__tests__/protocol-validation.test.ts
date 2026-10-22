import {
  findNestedRepeatableGroup,
  validateImportedProtocol,
  validateProtocolDraft,
} from "../protocol-validation";
import type { CustomSection } from "@/types/database";

const simpleGroupSection: CustomSection = {
  id: "fauna",
  title: "Fauna",
  fields: [
    {
      key: "registros",
      type: "repeatable_group",
      label: "Registros",
      itemFields: [
        { key: "especie", type: "text", label: "Espécie" },
        { key: "foto", type: "photo_input", label: "Foto" },
        { key: "gravacao", type: "audio_notes_input", label: "Gravação" },
      ],
    },
  ],
};

// What a hand-edited protocol file could carry: a group inside a group.
const nestedGroupSection = {
  id: "fauna",
  title: "Fauna",
  fields: [
    {
      key: "registros",
      type: "repeatable_group",
      label: "Registros",
      itemFields: [
        { key: "especie", type: "text", label: "Espécie" },
        {
          key: "individuos",
          type: "repeatable_group",
          label: "Indivíduos",
          itemFields: [{ key: "idade", type: "number", label: "Idade" }],
        },
      ],
    },
  ],
} as unknown as CustomSection;

const NESTED_ERROR = {
  key: "protocol.nestedGroupNotAllowed",
  params: { section: "Fauna", group: "Registros", nested: "Indivíduos" },
};

describe("findNestedRepeatableGroup", () => {
  it("finds a group nested inside another group, naming section, outer group and inner group", () => {
    expect(findNestedRepeatableGroup([nestedGroupSection])).toEqual({
      sectionTitle: "Fauna",
      groupLabel: "Registros",
      nestedLabel: "Indivíduos",
    });
  });

  it("finds it in a later section, not only the first one", () => {
    const plain: CustomSection = {
      id: "s1",
      title: "Plain",
      fields: [{ key: "texto", type: "text", label: "Texto" }],
    };

    expect(findNestedRepeatableGroup([plain, simpleGroupSection, nestedGroupSection])?.sectionTitle).toBe("Fauna");
  });

  it("accepts a simple group (even with photo and audio sub-fields) and sections without groups", () => {
    expect(findNestedRepeatableGroup([simpleGroupSection])).toBeNull();
    expect(findNestedRepeatableGroup([])).toBeNull();
  });

  it("never throws on malformed data read from a file", () => {
    expect(findNestedRepeatableGroup(null)).toBeNull();
    expect(findNestedRepeatableGroup("x")).toBeNull();
    expect(findNestedRepeatableGroup([null, 3, {}, { fields: "no" }, { fields: [null, { type: "repeatable_group" }] }])).toBeNull();
    expect(
      findNestedRepeatableGroup([{ title: "S", fields: [{ type: "repeatable_group", itemFields: "no" }] }]),
    ).toBeNull();
  });
});

describe("validateProtocolDraft (protocol builder)", () => {
  const draft = (sections: CustomSection[]) => ({ name: "Meu protocolo", theme: "fauna", sections });

  it("rejects a protocol with a nested repeatable group, with a clear error", () => {
    expect(validateProtocolDraft(draft([nestedGroupSection]))).toEqual(NESTED_ERROR);
  });

  it("still accepts a protocol with a simple repeatable group", () => {
    expect(validateProtocolDraft(draft([simpleGroupSection]))).toBeNull();
  });

  it("keeps the existing rules, in the same order", () => {
    const withField: CustomSection = { id: "s", title: "S", fields: [{ key: "a", type: "text", label: "A" }] };

    expect(validateProtocolDraft({ name: " ", theme: "t", sections: [withField] })).toEqual({
      key: "protocol.enterProtocolName",
    });
    expect(validateProtocolDraft({ name: "n", theme: " ", sections: [withField] })).toEqual({
      key: "protocol.enterTheme",
    });
    expect(validateProtocolDraft({ name: "n", theme: "t", sections: [] })).toEqual({
      key: "protocol.addAtLeastOneSection",
    });
    expect(validateProtocolDraft({ name: "n", theme: "t", sections: [{ ...withField, title: " " }] })).toEqual({
      key: "protocol.enterSectionTitle",
    });
    expect(validateProtocolDraft({ name: "n", theme: "t", sections: [{ id: "s", title: "S", fields: [] }] })).toEqual({
      key: "protocol.addAtLeastOneField",
    });
    expect(validateProtocolDraft(draft([withField]))).toBeNull();
  });
});

describe("validateImportedProtocol (protocol file import)", () => {
  const file = (sections: unknown) => ({ name: "Importado", theme: "t", schema: { sections } });

  it("rejects a protocol file with a nested repeatable group, with a clear error", () => {
    expect(validateImportedProtocol(file([nestedGroupSection]))).toEqual({ ok: false, error: NESTED_ERROR });
  });

  it("still accepts a protocol file with a simple repeatable group", () => {
    expect(validateImportedProtocol(file([simpleGroupSection]))).toEqual({ ok: true });
  });

  it("keeps rejecting files that are not a protocol at all", () => {
    const invalid = { ok: false, error: { key: "protocol.invalidProtocolFile" } };

    expect(validateImportedProtocol({ schema: { sections: [] } })).toEqual(invalid); // no name
    expect(validateImportedProtocol({ name: "x" })).toEqual(invalid); // no schema
    expect(validateImportedProtocol({ name: "x", schema: {} })).toEqual(invalid); // no sections
    expect(validateImportedProtocol(null)).toEqual(invalid);
  });
});
