import type { SoilProfileData, SoilLayer } from "@/modules/paisageo/types/soil";

/**
 * Converts GeoecologicalConstraintsModuleData → SoilProfileData (layers vs. soil_layers).
 * SoilProfileInput stores the array as `layers`; the module uses `soil_layers`
 * (aligned with the schema's groupId, which the column engine uses to locate the array).
 */
export function moduleDataToProfile(data: GeoecologicalConstraintsModuleData): SoilProfileData {
  const { soil_layers, mode, litter_layer: _l, stoniness: _s, rockiness: _r, bare_soil: _b, ...rest } = data;
  return { ...rest, mode: mode ?? "simple", layers: soil_layers };
}

/** Converts SoilProfileData → profile fields in GeoecologicalConstraintsModuleData. */
export function profileToModuleData(
  profile: SoilProfileData,
  current: GeoecologicalConstraintsModuleData
): GeoecologicalConstraintsModuleData {
  const { layers, ...rest } = profile;
  return {
    ...current,
    ...rest,
    soil_layers: layers,
  };
}

/**
 * Shape of the Geoecological Constraints module: geomorphology and relief +
 * cover/surface + soil profile, in a single flat object. The `soil_layers`
 * field (not `layers`) is the schema's dynamic group's groupId — the
 * column engine uses `data[groupId]` to locate the array.
 */
export interface GeoecologicalConstraintsModuleData {
  // --- Geomorphology and Relief ---
  exposure?: string;
  slope?: string;
  topographic_position?: string;
  slope_shape?: string;
  geomorphology_type?: string[];

  // --- Soil: collection mode selector ---
  mode?: "simple" | "detailed";

  // Simple mode (optional fields)
  simple_description?: string;
  simple_color_pattern?: SoilProfileData["simple_color_pattern"];
  simple_color_primary?: SoilProfileData["simple_color_primary"];
  simple_color_secondary?: SoilProfileData["simple_color_secondary"];
  simple_texture?: SoilProfileData["simple_texture"];
  simple_structure?: SoilProfileData["simple_structure"];
  simple_cracks?: SoilProfileData["simple_cracks"];
  simple_has_gravel?: boolean;
  simple_has_roots?: boolean;
  simple_has_nodules?: boolean;
  simple_has_dispersive?: boolean;
  simple_has_hardened?: boolean;
  simple_has_water_table?: boolean;
  simple_registered?: boolean;

  // Detailed mode — key aligned with the schema's groupId
  soil_layers?: SoilLayer[];

  // Surface cover (keys matching SurfaceCoverInput)
  litter_layer?: unknown;
  stoniness?: unknown;
  rockiness?: unknown;
  bare_soil?: unknown;
}

export function serializeGeoecologicalConstraints(data: unknown): string {
  return JSON.stringify(data);
}

export function deserializeGeoecologicalConstraints(raw: string): unknown {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  // Compatibility with legacy data: geomorphology_type can be a JSON string or a plain string
  const gt = parsed.geomorphology_type;
  if (typeof gt === "string") {
    try {
      parsed.geomorphology_type = JSON.parse(gt);
    } catch {
      parsed.geomorphology_type = gt ? [gt] : [];
    }
  }
  return parsed;
}
