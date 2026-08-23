// modules/paisageo/types/soil.ts

// Texture — 12 SiBCS classes
export type SoilTexture =
  | 'sand'              // Sand
  | 'loamy_sand'        // Loamy sand
  | 'sandy_loam'        // Sandy loam
  | 'loam'              // Loam
  | 'silt_loam'         // Silt loam
  | 'silt'              // Silt
  | 'clay_loam'         // Clay loam
  | 'sandy_clay_loam'   // Sandy clay loam
  | 'silty_clay_loam'   // Silty clay loam
  | 'sandy_clay'        // Sandy clay
  | 'silty_clay'        // Silty clay
  | 'clay';             // Clay

// Structure — 7 SiBCS types
export type SoilStructure =
  | 'single_grain'      // Single grain
  | 'massive'           // Massive
  | 'granular'          // Granular
  | 'angular_blocky'    // Angular blocky
  | 'subangular_blocky' // Subangular blocky
  | 'prismatic'         // Prismatic
  | 'columnar';         // Columnar

// Cracks — 3 SiBCS classes
export type SoilCrackWidth =
  | 'absent'  // Absent
  | 'narrow'  // Narrow (< 1 cm)
  | 'wide';   // Wide (> 1 cm)

// Color distribution pattern
export type SoilColorPattern =
  | 'homogeneous'  // Homogeneous
  | 'variegated';  // Variegated

// Chromatic denomination — 13 SiBCS terms
export type SoilColorTerm =
  | 'red'             // Red
  | 'reddish_brown'   // Reddish brown
  | 'yellowish_red'   // Yellowish red
  | 'strong_brown'    // Strong brown
  | 'yellowish_brown' // Yellowish brown
  | 'brownish_yellow' // Brownish yellow
  | 'yellow'          // Yellow
  | 'brown'           // Brown
  | 'dark_brown'      // Dark brown
  | 'grayish_brown'   // Grayish brown
  | 'gray'            // Gray
  | 'dark_gray'       // Dark gray
  | 'black';          // Black

export interface SoilLayer {
  id: string;
  depth_start: string;
  depth_end: string;

  // Formalized SiBCS attributes (no pre-selected default value — they stay
  // undefined until the user explicitly picks one)
  texture?: SoilTexture;
  structure?: SoilStructure;

  // Color — pattern + chromatic denomination
  color_pattern: SoilColorPattern;
  color_primary?: SoilColorTerm;
  color_secondary: SoilColorTerm | null; // null when color_pattern === 'homogeneous'

  // Special characteristics
  has_gravel: boolean;
  has_roots: boolean;
  has_nodules: boolean;
  has_dispersive: boolean;
  has_hardened: boolean;
  has_water_table: boolean;
  cracks: SoilCrackWidth;
}

export interface SoilProfileData {
  mode: "simple" | "detailed";
  // Legacy free-text field
  simple_description?: string;
  // Simple mode — formalized attributes
  simple_color_pattern?: SoilColorPattern;
  simple_color_primary?: SoilColorTerm;
  simple_color_secondary?: SoilColorTerm | null;
  simple_texture?: SoilTexture;
  simple_structure?: SoilStructure;
  simple_has_gravel?: boolean;
  simple_has_roots?: boolean;
  simple_has_nodules?: boolean;
  simple_has_dispersive?: boolean;
  simple_has_hardened?: boolean;
  simple_has_water_table?: boolean;
  simple_cracks?: SoilCrackWidth;
  // Whether the user has confirmed/registered the simple description
  // (distinguishes "not filled in yet" from "filled in with defaults").
  simple_registered?: boolean;
  // Detailed mode
  layers?: SoilLayer[];
}
