import type { ProtocolManifest, ExporterFactory } from "../types";

const noopExporter: ExporterFactory = () => ({
  async exportGeoJSON() {},
  async exportCSV() {},
  async extractMedia() {
    return { photos: [], audioNotes: [], notes: [] };
  },
});

/** Protocol A: provides demo.echo (returns the input). */
export const mockProtocolA: ProtocolManifest = {
  id: "mock-a",
  name: { pt: "Mock A" },
  version: "1.0.0",
  authors: ["test"],
  description: { pt: "Protocolo de teste A" },
  kind: "scientific",
  modules: [],
  provides: [
    {
      id: "demo.echo",
      version: "1.0.0",
      contract: { id: "demo.echo" },
      implementation: (input: unknown) => input,
    },
  ],
  exporter: noopExporter,
};

/** Protocol B: requires demo.echo, has a module with a dynamic group. */
export const mockProtocolB: ProtocolManifest = {
  id: "mock-b",
  name: { pt: "Mock B" },
  version: "1.0.0",
  authors: ["test"],
  description: { pt: "Protocolo de teste B" },
  kind: "scientific",
  modules: [
    {
      id: "items-module",
      title: { pt: "Módulo de itens" },
      schema: {
        fields: [
          {
            id: "label",
            label: { pt: "Rótulo" },
            type: "text",
          },
        ],
        dynamic: [
          {
            groupId: "items",
            itemFields: [
              { id: "name", label: { pt: "Nome" }, type: "text" },
              { id: "value", label: { pt: "Valor" }, type: "number" },
            ],
            columnNamePattern: "item_{i}_{field}",
          },
        ],
      },
      serialize: (d) => JSON.stringify(d),
      deserialize: (r) => JSON.parse(r),
    },
  ],
  requires: [{ id: "demo.echo" }],
  exporter: noopExporter,
};

/** Protocol C: requires a nonexistent capability → tests missing_capability. */
export const mockProtocolC: ProtocolManifest = {
  id: "mock-c",
  name: { pt: "Mock C" },
  version: "1.0.0",
  authors: ["test"],
  description: { pt: "Protocolo de teste C" },
  kind: "scientific",
  modules: [],
  requires: [{ id: "demo.missing" }],
  exporter: noopExporter,
};

/** Protocol D: also provides demo.echo → tests duplicate_capability. */
export const mockProtocolD: ProtocolManifest = {
  id: "mock-d",
  name: { pt: "Mock D" },
  version: "1.0.0",
  authors: ["test"],
  description: { pt: "Protocolo de teste D" },
  kind: "scientific",
  modules: [],
  provides: [
    {
      id: "demo.echo",
      version: "1.0.0",
      contract: { id: "demo.echo" },
      implementation: (input: unknown) => input,
    },
  ],
  exporter: noopExporter,
};

/**
 * Test data for dynamic-columns.
 * P1 has 2 items, P2 has 3 items → maxCount = 3.
 */
export const sampleModuleSchema = mockProtocolB.modules[0]!.schema;

export const samplePoints: Array<Record<string, unknown>> = [
  {
    label: "ponto 1",
    items: [
      { name: "a", value: 1 },
      { name: "b", value: 2 },
    ],
  },
  {
    label: "ponto 2",
    items: [
      { name: "x", value: 10 },
      { name: "y", value: 20 },
      { name: "z", value: 30 },
    ],
  },
];
