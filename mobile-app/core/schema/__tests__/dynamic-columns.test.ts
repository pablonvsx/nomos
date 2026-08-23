import { buildColumns } from "../dynamic-columns";
import { sampleModuleSchema, samplePoints } from "@/protocol-kernel/__tests__/fixtures";
import type { ModuleSchema } from "@/protocol-kernel/types";

describe("buildColumns (dynamic-columns)", () => {
  it("correctly detects max cardinality (P1=2 items, P2=3 → max=3)", () => {
    const { columns } = buildColumns(sampleModuleSchema, samplePoints, "pt");

    // 1 fixed field (label) + 3 × 2 dynamic fields (name, value) = 7 columns
    expect(columns).toHaveLength(7);
  });

  it("generates correct column names according to columnNamePattern", () => {
    const { columns } = buildColumns(sampleModuleSchema, samplePoints, "pt");

    const keys = columns.map((c) => c.key);
    expect(keys).toContain("label");
    expect(keys).toContain("item_1_name");
    expect(keys).toContain("item_1_value");
    expect(keys).toContain("item_2_name");
    expect(keys).toContain("item_2_value");
    expect(keys).toContain("item_3_name");
    expect(keys).toContain("item_3_value");
  });

  it("rowFor fills null for missing items on the point with fewer items", () => {
    const { rowFor } = buildColumns(sampleModuleSchema, samplePoints, "pt");

    // P1 has 2 items — the 3rd position should be null
    const row = rowFor(samplePoints[0]!);

    // structure: [label, item_1_name, item_1_value, item_2_name, item_2_value, item_3_name, item_3_value]
    expect(row[0]).toBe("ponto 1");
    expect(row[1]).toBe("a");
    expect(row[2]).toBe(1);
    expect(row[3]).toBe("b");
    expect(row[4]).toBe(2);
    expect(row[5]).toBeNull(); // item_3_name missing
    expect(row[6]).toBeNull(); // item_3_value missing
  });

  it("excludes exportable:false fields and photo/audio types from the plan", () => {
    const schemaWithExclusions: ModuleSchema = {
      fields: [
        { id: "titulo", label: { pt: "Título" }, type: "text" },
        { id: "foto", label: { pt: "Foto" }, type: "photo" },
        { id: "audio", label: { pt: "Áudio" }, type: "audio" },
        { id: "oculto", label: { pt: "Oculto" }, type: "text", exportable: false },
      ],
      dynamic: [
        {
          groupId: "layers",
          itemFields: [
            { id: "cor", label: { pt: "Cor" }, type: "text" },
            { id: "imagem", label: { pt: "Imagem" }, type: "photo" },
            { id: "interno", label: { pt: "Interno" }, type: "number", exportable: false },
          ],
          columnNamePattern: "layer_{i}_{field}",
        },
      ],
    };

    const pts = [{ titulo: "teste", foto: "uri", audio: "uri2", oculto: "x", layers: [{ cor: "vermelho", imagem: "uri", interno: 5 }] }];
    const { columns } = buildColumns(schemaWithExclusions, pts, "pt");

    const keys = columns.map((c) => c.key);

    expect(keys).toContain("titulo");
    expect(keys).not.toContain("foto");
    expect(keys).not.toContain("audio");
    expect(keys).not.toContain("oculto");
    expect(keys).toContain("layer_1_cor");
    expect(keys).not.toContain("layer_1_imagem");
    expect(keys).not.toContain("layer_1_interno");
  });

  it("appends the unit to the column header in parentheses when field.unit is set", () => {
    const schemaWithUnit: ModuleSchema = {
      fields: [
        { id: "diametro", label: { pt: "Diâmetro" }, type: "number", unit: "cm" },
        { id: "contagem", label: { pt: "Contagem" }, type: "number" },
      ],
    };
    const pts = [{ diametro: 15, contagem: 3 }];
    const { columns, rowFor } = buildColumns(schemaWithUnit, pts, "pt");

    const keys = columns.map((c) => c.key);
    expect(keys).toContain("diametro (cm)");
    // Field without a unit still exports exactly as it does today (no suffix).
    expect(keys).toContain("contagem");

    // The cell value stays a plain number, without the unit concatenated.
    const row = rowFor(pts[0]!);
    expect(row[0]).toBe(15);
    expect(typeof row[0]).toBe("number");
  });
});
