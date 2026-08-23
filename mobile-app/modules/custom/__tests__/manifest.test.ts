// Mocks for the renderers: avoids JSX and React Native imports being loaded
// by ts-jest ("node" environment). buildCustomModuleDescriptor now imports
// modules/registry.ts (for the moduleRef branch), which pulls in the
// Paisageo renderers transitively - the renderers are pure UI, not tested here.
jest.mock("@/modules/paisageo/modules/geoecological-constraints/GeoecologicalConstraintsModuleRenderer", () => ({
  GeoecologicalConstraintsModuleRenderer: () => null,
}));
jest.mock("@/modules/paisageo/modules/vegetation/VegetationModuleRenderer", () => ({
  VegetationModuleRenderer: () => null,
}));
jest.mock("@/modules/paisageo/modules/impacts/ImpactsModuleRenderer", () => ({
  ImpactsModuleRenderer: () => null,
}));
jest.mock("@/modules/paisageo/modules/geoecological-constraints/GeoecologicalConstraintsModuleReadOnlyRenderer", () => ({
  GeoecologicalConstraintsModuleReadOnlyRenderer: () => null,
}));
jest.mock("@/modules/paisageo/modules/vegetation/VegetationModuleReadOnlyRenderer", () => ({
  VegetationModuleReadOnlyRenderer: () => null,
}));
jest.mock("@/modules/paisageo/modules/impacts/ImpactsModuleReadOnlyRenderer", () => ({
  ImpactsModuleReadOnlyRenderer: () => null,
}));

import { buildCustomModuleDescriptor, customManifest } from "../manifest";
import { validateModuleSchema } from "@/core/schema/module-schema";
import { buildColumns } from "@/core/schema/dynamic-columns";
import { getSharedModule } from "@/modules/registry";
import type { CustomSection, CustomFieldOption } from "@/types/database";

describe("buildCustomModuleDescriptor", () => {
  it("produces a valid ModuleDescriptor from a simple section", () => {
    const section: CustomSection = {
      id: "section_test",
      title: "Observações",
      fields: [
        { key: "obs", type: "text", label: "Observação", required: false },
        { key: "count", type: "number", label: "Contagem", required: true },
      ],
    };

    const descriptor = buildCustomModuleDescriptor(section);

    expect(descriptor.id).toBe("section_test");
    expect(descriptor.title.pt).toBe("Observações");
    expect(descriptor.schema.fields).toHaveLength(2);

    const result = validateModuleSchema(descriptor.schema);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("serialize/deserialize are inverses of each other", () => {
    const section: CustomSection = {
      id: "section_serde",
      title: "Teste",
      fields: [{ key: "nome", type: "text", label: "Nome" }],
    };
    const descriptor = buildCustomModuleDescriptor(section);
    const data = { nome: "teste", extra: 42 };

    const serialized = descriptor.serialize(data);
    expect(typeof serialized).toBe("string");
    expect(descriptor.deserialize(serialized)).toEqual(data);
  });

  it("deserialize returns {} for invalid JSON", () => {
    const section: CustomSection = {
      id: "section_err",
      title: "Erro",
      fields: [],
    };
    const descriptor = buildCustomModuleDescriptor(section);
    expect(descriptor.deserialize("not-json")).toEqual({});
  });

  it("maps radio with options to a FieldSchema with SelectOption[]", () => {
    const section: CustomSection = {
      id: "section_radio_options",
      title: "Seleção",
      fields: [
        {
          key: "habitat",
          type: "radio",
          label: "Habitat",
          options: [{ value: "Floresta" }, { value: "Cerrado" }],
        },
      ],
    };
    const descriptor = buildCustomModuleDescriptor(section);
    const field = descriptor.schema.fields[0]!;

    expect(field.type).toBe("select"); // radio maps to the kernel's "select" FieldType
    expect(field.options).toHaveLength(2);
    expect(field.options![0]!.value).toBe("Floresta");
    expect(field.options![0]!.label.pt).toBe("Floresta");

    const result = validateModuleSchema(descriptor.schema);
    expect(result.ok).toBe(true);
  });

  it("maps photo_input → 'photo', species_list → 'species', yes_no → 'boolean'", () => {
    const section: CustomSection = {
      id: "section_types",
      title: "Tipos",
      fields: [
        { key: "foto", type: "photo_input", label: "Foto" },
        { key: "especies", type: "species_list", label: "Espécies" },
        { key: "presenca", type: "yes_no", label: "Presente?" },
      ],
    };
    const descriptor = buildCustomModuleDescriptor(section);
    const [foto, especies, presenca] = descriptor.schema.fields;

    expect(foto!.type).toBe("photo");
    expect(especies!.type).toBe("species");
    expect(presenca!.type).toBe("boolean");
  });

  it("renderAs preserves all 12 original CustomFieldTypes", () => {
    // This test ensures GenericModuleRenderer will receive the right type
    // to pick the correct component in FieldRenderer.
    // "select" was removed from CustomFieldType (redundant with "radio");
    // "notes_list" was added (Text Notes, separate from Audio Notes).
    const allTypes: Array<{ key: string; type: any; label: string; options?: CustomFieldOption[] }> = [
      { key: "f1", type: "text", label: "Texto" },
      { key: "f2", type: "textarea", label: "Texto longo" },
      { key: "f3", type: "number", label: "Número" },
      { key: "f5", type: "radio", label: "Radio", options: [{ value: "X" }, { value: "Y" }] },
      { key: "f6", type: "checkbox", label: "Caixas", options: [{ value: "P" }, { value: "Q" }] },
      { key: "f7", type: "yes_no", label: "Sim/Não" },
      { key: "f8", type: "rating", label: "Avaliação" },
      { key: "f9", type: "photo_input", label: "Foto" },
      { key: "f10", type: "audio_notes_input", label: "Áudio" },
      { key: "f11", type: "species_list", label: "Espécies" },
      { key: "f12", type: "tags_input", label: "Tags" },
      { key: "f13", type: "notes_list", label: "Notas de texto" },
    ];

    const section: CustomSection = { id: "all_types", title: "Todos", fields: allTypes };
    const descriptor = buildCustomModuleDescriptor(section);
    const fields = descriptor.schema.fields;

    const renderAsMap: Record<string, string> = {};
    for (const f of fields) {
      renderAsMap[f.id] = f.renderAs ?? "";
    }

    // Each field should have renderAs equal to the builder's original type
    expect(renderAsMap["f1"]).toBe("text");
    expect(renderAsMap["f2"]).toBe("textarea");
    expect(renderAsMap["f3"]).toBe("number");
    expect(renderAsMap["f5"]).toBe("radio");
    expect(renderAsMap["f6"]).toBe("checkbox");
    expect(renderAsMap["f7"]).toBe("yes_no");
    expect(renderAsMap["f8"]).toBe("rating");
    expect(renderAsMap["f9"]).toBe("photo_input");
    expect(renderAsMap["f10"]).toBe("audio_notes_input");
    expect(renderAsMap["f11"]).toBe("species_list");
    expect(renderAsMap["f12"]).toBe("tags_input");
    expect(renderAsMap["f13"]).toBe("notes_list");
  });

  it("maps notes_list → the kernel's 'notes' (excluded from export columns), preserving renderAs so FieldRenderer picks NotesListInput", () => {
    const section: CustomSection = {
      id: "section_notes",
      title: "Notas",
      fields: [{ key: "observacoes", type: "notes_list", label: "Observações" }],
    };
    const descriptor = buildCustomModuleDescriptor(section);
    const field = descriptor.schema.fields[0]!;

    expect(field.type).toBe("notes"); // kernel's semantic type; MEDIA_TYPES excludes it from CSV/GeoJSON columns
    expect(field.renderAs).toBe("notes_list"); // FieldRenderer uses this to render NotesListInput
  });

  it("radio with options → FieldSchema with SelectOption[] (value, label and desc)", () => {
    const section: CustomSection = {
      id: "section_radio",
      title: "Radio",
      fields: [
        {
          key: "opcao",
          type: "radio",
          label: "Opção",
          options: [
            { value: "Sim", description: "Confirma a presença" },
            { value: "Não" },
            { value: "Talvez" },
          ],
        },
      ],
    };
    const descriptor = buildCustomModuleDescriptor(section);
    const field = descriptor.schema.fields[0]!;

    expect(field.renderAs).toBe("radio");
    // options in the kernel are SelectOption[] with value, localized label and optional desc
    expect(field.options).toHaveLength(3);
    expect(field.options![0]!.value).toBe("Sim");
    expect(field.options![0]!.label.pt).toBe("Sim");
    expect(field.options![0]!.desc?.pt).toBe("Confirma a presença");
    expect(field.options![1]!.desc).toBeUndefined();
  });

  it("propagates min/max to the FieldSchema (rating and number)", () => {
    const section: CustomSection = {
      id: "section_min_max",
      title: "Limites",
      fields: [
        { key: "avaliacao", type: "rating", label: "Avaliação", max: 10 },
        { key: "contagem", type: "number", label: "Contagem", min: -5, max: 20 },
        { key: "sem_limite", type: "number", label: "Livre" },
      ],
    };
    const descriptor = buildCustomModuleDescriptor(section);
    const [avaliacao, contagem, semLimite] = descriptor.schema.fields;

    expect(avaliacao!.max).toBe(10);
    expect(avaliacao!.min).toBeUndefined();
    expect(contagem!.min).toBe(-5);
    expect(contagem!.max).toBe(20);
    expect(semLimite!.min).toBeUndefined();
    expect(semLimite!.max).toBeUndefined();
  });

  it("propagates description to the FieldSchema (field with and without description)", () => {
    const section: CustomSection = {
      id: "section_description",
      title: "Descrição",
      fields: [
        { key: "com_desc", type: "text", label: "Com descrição", description: "Ajuda o preenchimento" },
        { key: "sem_desc", type: "text", label: "Sem descrição" },
      ],
    };
    const descriptor = buildCustomModuleDescriptor(section);
    const [comDesc, semDesc] = descriptor.schema.fields;

    expect(comDesc!.description?.pt).toBe("Ajuda o preenchimento");
    expect(semDesc!.description).toBeUndefined();
  });

  it("propagates unit to the FieldSchema (number with and without a unit)", () => {
    const section: CustomSection = {
      id: "section_unit",
      title: "Unidade",
      fields: [
        { key: "diametro", type: "number", label: "Diâmetro", unit: "cm" },
        { key: "sem_unidade", type: "number", label: "Livre" },
      ],
    };
    const descriptor = buildCustomModuleDescriptor(section);
    const [diametro, semUnidade] = descriptor.schema.fields;

    expect(diametro!.unit).toBe("cm");
    expect(semUnidade!.unit).toBeUndefined();
  });

  it("maps percentage → the kernel's 'percentage' and azimuth → 'azimuth'", () => {
    const section: CustomSection = {
      id: "section_percentage_azimuth",
      title: "Porcentagem e Azimute",
      fields: [
        { key: "cobertura", type: "percentage", label: "Cobertura" },
        { key: "direcao", type: "azimuth", label: "Direção" },
      ],
    };
    const descriptor = buildCustomModuleDescriptor(section);
    const [cobertura, direcao] = descriptor.schema.fields;

    expect(cobertura!.type).toBe("percentage");
    expect(cobertura!.renderAs).toBe("percentage");
    expect(direcao!.type).toBe("azimuth");
    expect(direcao!.renderAs).toBe("azimuth");

    expect(validateModuleSchema(descriptor.schema).ok).toBe(true);
  });

  it("checkbox with options → valid FieldSchema with multiselect", () => {
    const section: CustomSection = {
      id: "section_checkbox",
      title: "Caixas",
      fields: [
        {
          key: "itens",
          type: "checkbox",
          label: "Itens",
          options: [{ value: "A" }, { value: "B" }, { value: "C" }],
        },
      ],
    };
    const descriptor = buildCustomModuleDescriptor(section);
    const field = descriptor.schema.fields[0]!;

    expect(field.type).toBe("multiselect"); // kernel's semantic type
    expect(field.renderAs).toBe("checkbox"); // original UI type
    expect(field.options).toHaveLength(3);
    // Schema should be valid (multiselect with non-empty options)
    expect(validateModuleSchema(descriptor.schema).ok).toBe(true);
  });
});

describe("buildCustomModuleDescriptor - repeatable_group", () => {
  it("generates an entry in schema.dynamic (not schema.fields) with groupId, itemFields and columnNamePattern", () => {
    const section: CustomSection = {
      id: "section_group",
      title: "Observações repetidas",
      fields: [
        { key: "obs_gerais", type: "text", label: "Observações gerais" },
        {
          key: "avistamentos",
          type: "repeatable_group",
          label: "Avistamentos",
          itemFields: [
            { key: "especie", type: "text", label: "Espécie" },
            { key: "quantidade", type: "number", label: "Quantidade", min: 0 },
          ],
        },
      ],
    };

    const descriptor = buildCustomModuleDescriptor(section);

    // flat field remains in schema.fields
    expect(descriptor.schema.fields).toHaveLength(1);
    expect(descriptor.schema.fields[0]!.id).toBe("obs_gerais");

    // repeatable group does NOT appear in schema.fields
    expect(descriptor.schema.fields.some((f) => f.id === "avistamentos")).toBe(false);

    // and it appears in schema.dynamic
    expect(descriptor.schema.dynamic).toHaveLength(1);
    const group = descriptor.schema.dynamic![0]!;
    expect(group.groupId).toBe("avistamentos");
    expect(group.itemFields).toHaveLength(2);
    expect(group.itemFields[0]!.id).toBe("especie");
    expect(group.itemFields[1]!.id).toBe("quantidade");
    expect(group.itemFields[1]!.min).toBe(0);
    expect(group.columnNamePattern).toBe("avistamentos_{i}_{field}");
    expect(group.label?.pt).toBe("Avistamentos");

    const result = validateModuleSchema(descriptor.schema);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("supports multiple repeatable groups in the same section", () => {
    const section: CustomSection = {
      id: "section_multi_group",
      title: "Múltiplos grupos",
      fields: [
        {
          key: "grupo_a",
          type: "repeatable_group",
          label: "Grupo A",
          itemFields: [{ key: "valor", type: "number", label: "Valor" }],
        },
        {
          key: "grupo_b",
          type: "repeatable_group",
          label: "Grupo B",
          itemFields: [{ key: "nome", type: "text", label: "Nome" }],
        },
      ],
    };

    const descriptor = buildCustomModuleDescriptor(section);

    expect(descriptor.schema.fields).toHaveLength(0);
    expect(descriptor.schema.dynamic).toHaveLength(2);
    expect(descriptor.schema.dynamic!.map((g) => g.groupId)).toEqual(["grupo_a", "grupo_b"]);
  });

  it("a section with no repeatable field does not populate schema.dynamic", () => {
    const section: CustomSection = {
      id: "section_no_group",
      title: "Sem grupo",
      fields: [{ key: "texto", type: "text", label: "Texto" }],
    };

    const descriptor = buildCustomModuleDescriptor(section);
    expect(descriptor.schema.dynamic).toBeUndefined();
  });

  it("group sub-fields reuse the same type mapping as flat fields (radio→select, with options)", () => {
    const section: CustomSection = {
      id: "section_group_types",
      title: "Tipos no grupo",
      fields: [
        {
          key: "itens",
          type: "repeatable_group",
          label: "Itens",
          itemFields: [
            {
              key: "categoria",
              type: "radio",
              label: "Categoria",
              options: [{ value: "A" }, { value: "B" }],
            },
            { key: "foto", type: "photo_input", label: "Foto" },
          ],
        },
      ],
    };

    const descriptor = buildCustomModuleDescriptor(section);
    const group = descriptor.schema.dynamic![0]!;

    expect(group.itemFields[0]!.type).toBe("select");
    expect(group.itemFields[0]!.renderAs).toBe("radio");
    expect(group.itemFields[0]!.options).toHaveLength(2);
    expect(group.itemFields[1]!.type).toBe("photo");

    expect(validateModuleSchema(descriptor.schema).ok).toBe(true);
  });

  it("round-trip: buildColumns expands the custom repeatable group's columns (generic engine, unchanged)", () => {
    const section: CustomSection = {
      id: "fauna",
      title: "Fauna",
      fields: [
        {
          key: "avistamentos",
          type: "repeatable_group",
          label: "Avistamentos",
          itemFields: [
            { key: "especie", type: "text", label: "Espécie" },
            { key: "quantidade", type: "number", label: "Quantidade" },
          ],
        },
      ],
    };
    const descriptor = buildCustomModuleDescriptor(section);

    const pointWith2Items = { avistamentos: [{ especie: "Onça", quantidade: 1 }, { especie: "Tatu", quantidade: 3 }] };
    const pointWith0Items = { avistamentos: [] };

    const plan = buildColumns(descriptor.schema, [pointWith2Items, pointWith0Items], "pt");

    const keys = plan.columns.map((c: { key: string }) => c.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "avistamentos_1_especie",
        "avistamentos_1_quantidade",
        "avistamentos_2_especie",
        "avistamentos_2_quantidade",
      ]),
    );

    const row1 = plan.rowFor(pointWith2Items);
    const row2 = plan.rowFor(pointWith0Items);
    expect(row1[keys.indexOf("avistamentos_1_especie")]).toBe("Onça");
    expect(row1[keys.indexOf("avistamentos_2_especie")]).toBe("Tatu");
    expect(row2[keys.indexOf("avistamentos_1_especie")]).toBeNull();
  });
});

describe("buildCustomModuleDescriptor with moduleRef (shared scientific module)", () => {
  it("returns the shared module's real ModuleDescriptor, not one synthesized from fields", () => {
    const section: CustomSection = {
      id: "vegetation",
      title: "Vegetação",
      fields: [],
      moduleRef: "vegetation",
    };

    const descriptor = buildCustomModuleDescriptor(section);
    const shared = getSharedModule("vegetation");

    expect(descriptor).toBe(shared!.descriptor);
    // The real vegetation module has dynamic strata (Küchler matrix) -
    // a section synthesized from `fields: []` would never have this.
    expect(descriptor.schema.dynamic).toBeDefined();
  });

  it("also works for the geoecological constraints module", () => {
    const section: CustomSection = {
      id: "geoecological_constraints",
      title: "Condicionantes Geoecológicos",
      fields: [],
      moduleRef: "geoecological_constraints",
    };

    const descriptor = buildCustomModuleDescriptor(section);
    const shared = getSharedModule("geoecological_constraints");

    expect(descriptor).toBe(shared!.descriptor);
  });

  it("throws an error for an unknown moduleRef", () => {
    const section = {
      id: "desconhecido",
      title: "Desconhecido",
      fields: [],
      moduleRef: "desconhecido",
    } as unknown as CustomSection;

    expect(() => buildCustomModuleDescriptor(section)).toThrow(/unknown shared module ref/);
  });
});

describe("customManifest", () => {
  it("has id 'custom', kind 'custom' and empty modules", () => {
    expect(customManifest.id).toBe("custom");
    expect(customManifest.kind).toBe("custom");
    expect(customManifest.modules).toHaveLength(0);
  });

  it("exporter is a functional stub (does not throw on the factory call)", () => {
    const exporter = customManifest.exporter({ bus: null as any });
    expect(typeof exporter.exportGeoJSON).toBe("function");
    expect(typeof exporter.exportCSV).toBe("function");
  });
});
