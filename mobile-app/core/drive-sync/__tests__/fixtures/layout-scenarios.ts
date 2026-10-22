// Point scenarios shared by the Drive layout suites: the three kinds of point
// the layout has to handle, plus the custom protocol they run on.

export const POINT_UUID = "3f2b8c1e-5d4a-4b6e-9a1f-0c7d2e8b4a56";

/** A valid v4-shaped uuid for the nth test point. */
export function uuidFor(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

export interface ScenarioPointRow {
  id: number;
  project_id: number;
  protocol_id: string;
  point_number: number;
  lat: number;
  lon: number;
  altitude: number | null;
  generated_name: string | null;
  landscape_class_id: number | null;
  photos: string | null;
  audio_notes: string | null;
  additional_notes: string | null;
  point_size: number | null;
  created_at: string;
  created_by: string | null;
  approval_status: "pending" | "approved" | "rejected" | null;
  drive_synced_at: string | null;
  uuid: string | null;
}

export interface ScenarioModuleRow {
  module_id: string;
  schema_version: string;
  data_json: string;
}

export interface ScenarioProject {
  id: number;
  collaboration_role: "owner" | "collaborator" | null;
  drive_folder_id: string | null;
  protocol_id: string;
  protocol_source: "official" | "custom";
}

export interface Scenario {
  project: ScenarioProject;
  point: ScenarioPointRow;
  modules: ScenarioModuleRow[];
  /** Local file uri -> bytes, to be placed in the fake filesystem. */
  media: Record<string, string>;
}

export const photos = (...uris: string[]) => JSON.stringify(uris.map((uri, i) => ({ uri, timestamp: i + 1 })));
export const audio = (...uris: string[]) =>
  JSON.stringify(uris.map((uri, i) => ({ uri, duration: 3, timestamp: i + 1 })));

export const customProtocol = {
  id: 7,
  name: "Custom",
  theme: "t",
  schema: {
    sections: [
      {
        id: "section_1",
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
  },
};

const OFFICIAL: ScenarioProject = {
  id: 1,
  collaboration_role: "owner",
  drive_folder_id: "root",
  protocol_id: "nomos-paisageo-v1",
  protocol_source: "official",
};
const CUSTOM: ScenarioProject = { ...OFFICIAL, protocol_id: "7", protocol_source: "custom" };

export function makePointRow(overrides: Partial<ScenarioPointRow> = {}): ScenarioPointRow {
  return {
    id: 1,
    project_id: 1,
    protocol_id: "nomos-paisageo-v1",
    point_number: 3,
    lat: -8.05,
    lon: -34.9,
    altitude: null,
    generated_name: "Caatinga arbustiva",
    landscape_class_id: null,
    photos: null,
    audio_notes: null,
    additional_notes: null,
    point_size: null,
    created_at: "2026-01-01T00:00:00.000Z",
    created_by: "ABCD",
    approval_status: "approved",
    drive_synced_at: null,
    uuid: POINT_UUID,
    ...overrides,
  };
}

/** (a) Paisageo official protocol, 2 photos and 1 audio note on the point. */
export function officialScenario(): Scenario {
  return {
    project: OFFICIAL,
    point: makePointRow({
      photos: photos("file:///c/p1.jpg", "file:///c/p2.jpg"),
      audio_notes: audio("file:///c/a1.m4a"),
    }),
    modules: [{ module_id: "vegetation", schema_version: "1.0", data_json: '{"physiognomy":"x"}' }],
    media: { "file:///c/p1.jpg": "photo-1", "file:///c/p2.jpg": "photo-2", "file:///c/a1.m4a": "audio-1" },
  };
}

/** (b) Custom protocol: a photo and an audio note on the point and one photo in a section field. */
export function sectionScenario(): Scenario {
  return {
    project: CUSTOM,
    point: makePointRow({
      protocol_id: "7",
      photos: photos("file:///c/p1.jpg"),
      audio_notes: audio("file:///c/a1.m4a"),
    }),
    modules: [
      {
        module_id: "section_1",
        schema_version: "1.0",
        data_json: JSON.stringify({ fotos: photos("file:///c/s1.jpg"), grupo: [] }),
      },
    ],
    media: { "file:///c/p1.jpg": "photo-1", "file:///c/a1.m4a": "audio-1", "file:///c/s1.jpg": "section-photo" },
  };
}

/** (c) Custom protocol: a repeatable group of 2 items, each with a photo and an audio note. */
export function groupScenario(): Scenario {
  return {
    project: CUSTOM,
    point: makePointRow({ protocol_id: "7" }),
    modules: [
      {
        module_id: "section_1",
        schema_version: "1.0",
        data_json: JSON.stringify({
          fotos: "[]",
          grupo: [
            { foto_item: photos("file:///c/g0.jpg"), audio_item: audio("file:///c/g0.m4a"), nome: "item 0" },
            { foto_item: photos("file:///c/g1.jpg"), audio_item: audio("file:///c/g1.m4a"), nome: "item 1" },
          ],
        }),
      },
    ],
    media: {
      "file:///c/g0.jpg": "g0-photo",
      "file:///c/g0.m4a": "g0-audio",
      "file:///c/g1.jpg": "g1-photo",
      "file:///c/g1.m4a": "g1-audio",
    },
  };
}
