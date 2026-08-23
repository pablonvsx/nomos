import type { PointEnvelope } from "@/protocol-kernel/types";

// --- Vegetation data ---

export const vegData2Strata = {
  raw_formula: "B7c,D7i",
  kuchler_formula: "B7cD7i",
  total_strata: 2,
  physiognomy_name: "Savana Estépica",
  classification_group: "Savana",
  classification_type: "Estépica Parque",
  description_text: "Vegetação aberta",
  conservation_status: "conservada",
  land_use: "Preservação",
  vegetation_strata: [
    { height_id: "A", height_range: "0-2m", life_form: "z", cover_class: "25-50%", leaf_adaptation: "r" },
    { height_id: "B", height_range: "2-5m", life_form: "Z", cover_class: "5-25%", leaf_adaptation: "e" },
  ],
};

export const vegData4Strata = {
  raw_formula: "B7c,D7i.G2c.A3s",
  kuchler_formula: "B7cD7iG2cA3s",
  total_strata: 4,
  physiognomy_name: "Floresta",
  classification_group: "Floresta",
  classification_type: "Decidual",
  description_text: "Dossel denso\nnota adicional",
  conservation_status: "em_regeneracao_nativas",
  land_use: null,
  vegetation_strata: [
    { height_id: "A", height_range: "0-2m",   life_form: "z",  cover_class: "25-50%", leaf_adaptation: "r" },
    { height_id: "B", height_range: "2-8m",   life_form: "Z",  cover_class: "50-75%", leaf_adaptation: "e" },
    { height_id: "C", height_range: "8-20m",  life_form: "Z",  cover_class: "50-75%", leaf_adaptation: "e" },
    { height_id: "D", height_range: "20-35m", life_form: "Z",  cover_class: "25-50%", leaf_adaptation: "d" },
  ],
};

// --- Soil data ---

export const soilSimple = {
  mode: "simple" as const,
  simple_color_pattern: "homogeneous",
  simple_color_primary: "reddish_brown",
  simple_texture: "sandy_loam",
  simple_structure: "granular",
  simple_cracks: "absent",
  simple_has_gravel: false,
  simple_has_roots: true,
  simple_has_nodules: false,
  simple_has_dispersive: false,
  simple_has_hardened: false,
  simple_has_water_table: false,
  litter_layer: "5-25%",
  stoniness: "absent",
  rockiness: "absent",
  bare_soil: "absent",
};

export const soilDetailed3Layers = {
  mode: "detailed" as const,
  litter_layer: "25-50%",
  stoniness: "1-5%",
  rockiness: "absent",
  bare_soil: "absent",
  soil_layers: [
    { depth_start: "0",  depth_end: "20",  texture: "sandy_loam",  structure: "granular",    color_pattern: "homogeneous", color_primary: "reddish_brown", color_secondary: null, cracks: "absent", has_gravel: false, has_roots: true,  has_nodules: false, has_dispersive: false, has_hardened: false, has_water_table: false },
    { depth_start: "20", depth_end: "60",  texture: "clay_loam",   structure: "angular_blocky", color_pattern: "variegated", color_primary: "red",          color_secondary: "yellowish_brown", cracks: "narrow", has_gravel: true,  has_roots: false, has_nodules: false, has_dispersive: false, has_hardened: false, has_water_table: false },
    { depth_start: "60", depth_end: "100", texture: "clay",        structure: "prismatic",   color_pattern: "homogeneous", color_primary: "strong_brown", color_secondary: null, cracks: "wide",   has_gravel: false, has_roots: false, has_nodules: true,  has_dispersive: false, has_hardened: true,  has_water_table: false },
  ],
};

// --- Geomorphology data ---

export const geomData = {
  exposure: "windward",
  slope: "gentle",
  topographic_position: "mid_slope",
  slope_shape: "convex",
  geomorphology_type: ["hillslope", "fluvial"],
};

// --- Impact data ---

export const impactsData2 = {
  impacts: [
    { type: "pollution", magnitude: "occasional", details: "esgoto próximo" },
    { type: "erosion",   magnitude: "critical",    details: "" },
  ],
};

export const impactsDataEmpty = {
  impacts: [],
};

// --- Reference PointEnvelopes ---

export const PAISAGEO_POINTS: PointEnvelope[] = [
  // Point 1: 2 strata, simple soil, 2 impacts
  {
    id: "1",
    projectId: "10",
    protocolId: "paisageo",
    pointNumber: 1,
    lat: -8.0,
    lon: -36.0,
    altitude: 500,
    generatedName: "SE_001",
    landscapeClassId: 42,
    createdAt: "2026-01-10T08:00:00.000Z",
    pointSize: 20,
    photos: ["file://a.jpg"],
    audioNotes: [{ uri: "file://note.m4a", duration: 5, timestamp: 1234567890 }],
    additionalNotes: ["Observação de campo"],
    modules: {
      vegetation: vegData2Strata,
      geoecological_constraints: { ...geomData, ...soilSimple },
      impacts: impactsData2,
    },
  },
  // Point 2: 4 strata, detailed soil with 3 layers, 0 impacts
  {
    id: "2",
    projectId: "10",
    protocolId: "paisageo",
    pointNumber: 2,
    lat: -8.1,
    lon: -36.1,
    altitude: 520,
    generatedName: "SE_002",
    landscapeClassId: undefined,
    createdAt: "2026-01-10T09:00:00.000Z",
    pointSize: undefined,
    photos: [],
    audioNotes: [],
    additionalNotes: [],
    modules: {
      vegetation: vegData4Strata,
      geoecological_constraints: { ...geomData, ...soilDetailed3Layers },
      impacts: impactsDataEmpty,
    },
  },
  // Point 3: no vegetation module, simple soil, 1 impact
  {
    id: "3",
    projectId: "10",
    protocolId: "paisageo",
    pointNumber: 3,
    lat: -8.2,
    lon: -36.2,
    altitude: undefined,
    generatedName: undefined,
    landscapeClassId: undefined,
    createdAt: undefined,
    pointSize: undefined,
    photos: undefined,
    audioNotes: undefined,
    additionalNotes: undefined,
    modules: {
      geoecological_constraints: {
        ...soilSimple,
        exposure: "leeward", slope: "flat", geomorphology_type: ["fluvial"],
      },
      impacts: { impacts: [{ type: "invasive_species", magnitude: "common", details: "braquiária" }] },
    },
  },
];

// --- PointEnvelopes for the Custom protocol ---

export const CUSTOM_POINTS: PointEnvelope[] = [
  {
    id: "101",
    projectId: "20",
    protocolId: "custom",
    pointNumber: 1,
    lat: -8.0,
    lon: -36.0,
    altitude: 300,
    generatedName: undefined,
    landscapeClassId: undefined,
    createdAt: "2026-01-15T10:00:00.000Z",
    pointSize: undefined,
    photos: ["file://img1.jpg", "file://img2.jpg"],
    audioNotes: [],
    additionalNotes: [],
    modules: {
      "section-a": {
        nome_local: "Lagoa do Mato",
        area_ha: 12.5,
        tipo_fitofisionomia: "Campo",
      },
      "section-b": {
        observador: "João",
        condicao_tempo: "Ensolarado",
        presenca_fauna: true,
      },
    },
  },
  {
    id: "102",
    projectId: "20",
    protocolId: "custom",
    pointNumber: 2,
    lat: -8.1,
    lon: -36.1,
    altitude: undefined,
    generatedName: undefined,
    landscapeClassId: undefined,
    createdAt: "2026-01-15T11:00:00.000Z",
    pointSize: undefined,
    photos: [],
    audioNotes: [],
    additionalNotes: ["nota extra"],
    modules: {
      "section-a": {
        nome_local: "Riacho Fundo",
        area_ha: 3.2,
        tipo_fitofisionomia: "Caatinga",
      },
      "section-b": {
        observador: "Maria",
        condicao_tempo: "Nublado",
        presenca_fauna: false,
      },
    },
  },
];
