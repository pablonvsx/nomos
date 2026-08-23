// src/types/database.ts
/**
 * This file contains TypeScript interfaces that define the structure of the database entities used in the application.
 */

// This interface represents a protocol in the database
export interface Protocol {
  id: string; // Unique identifier for the protocol. E.g. "caatinga-grupo-paisageo-v1"
  title: string; // Title of the protocol. E.g. "Caatinga (Grupo Paisageo)"
  authors: string[]; // Array of authors of the protocol (because protocols can have multiple authors)
  description: string; // Description of the protocol
  year: number; // Year the protocol was created or published
  version: string; // Version of the protocol. E.g. "1.0"
  json_rules_path: string; // Path to the JSON file defining the protocol structure
}

// This interface represents a project in the database
export interface Project {
  id: number; // Unique identifier for the project (automatically generated)
  name: string; // Name of the project
  description?: string; // Optional description of the project
  protocol_id: string; // Identifier for the protocol used in the project
  protocol_source: "official" | "custom"; // Source of the protocol: 'official' (from protocols table) or 'custom' (from custom_protocols table)
  created_at: string; // Timestamp of when the project was created
  last_updated: string; // Timestamp of the last update to the project
  geojson_layer?: string; // Optional GeoJSON layer (path) associated with the project to visualize spatial data
  geojson_field_route?: string; // Optional GeoJSON field route (path) associated with the project
  is_classified: 0 | 1; // Flag indicating whether the project has been classified (0 = no, 1 = yes)
  last_classified_at?: string; // Optional timestamp of the last classification operation
  vegetation_classification_type?: "standard" | "custom"; // Vegetation classification type: 'standard' (Nomos decision tree) or 'custom' (user-defined)
  active_custom_vegetation_classification_id?: number; // ID of the active custom vegetation classification, if type is 'custom'
}

// Ponto de levantamento (schema-driven, Fase 5+)
// Representa uma linha da tabela `points`
export interface Point {
  id: number;
  project_id: number;
  protocol_id: string;          // "paisageo" | "custom"
  point_number: number;
  lat: number;
  lon: number;
  altitude?: number | null;
  generated_name?: string | null;
  landscape_class_id?: number | null;
  photos?: string | null;       // JSON array (provisional until Phase 7)
  audio_notes?: string | null;  // JSON array (provisional)
  additional_notes?: string | null; // JSON array (provisional)
  point_size?: number | null;   // plot size (provisional)
  created_at: string;
  updated_at: string;
}

// A point's module data (one point_modules row)
export interface PointModule {
  point_id: number;
  module_id: string;
  schema_version: string;
  data_json: string;            // ModuleDescriptor's serialize()
}

// Complete point with all modules deserialized
export interface PointWithModules extends Point {
  modules: Record<string, unknown>;  // moduleId → deserialized data
}

// ============================================
// CUSTOM PROTOCOLS TYPES
// ============================================

// Field types available for custom protocols
export type CustomFieldType =
  | "text" // Short text input
  | "textarea" // Long text input (multiline)
  | "number" // Numeric input
  | "percentage" // Fixed 0-100 slider
  | "azimuth" // Fixed 0-360 degrees, shows cardinal point
  | "date" // Date input (DD/MM/YYYY)
  | "time" // Time input (HH:MM)
  | "radio" // Single selection radio buttons
  | "checkbox" // Multiple selection checkboxes
  | "yes_no" // Boolean (Yes/No)
  | "rating" // Rating scale (1-5 stars, etc)
  | "photo_input" // Photo capture/upload
  | "tags_input" // List of tags/items
  | "species_list" // Species catalog with GBIF search
  | "notes_list" // Free-text list of notes
  | "audio_notes_input" // Audio recordings
  | "repeatable_group"; // Repeatable group of sub-fields (N items, each with its own values)

// A single option in a radio/checkbox field, with an optional description
// shown inline (below the option label) when filling out the form.
export interface CustomFieldOption {
  value: string;
  description?: string;
}

// Configuration for a single field in the custom protocol
export interface CustomFieldConfig {
  key: string; // Unique key for this field (e.g., "species_observed")
  type: CustomFieldType; // Type of field
  label: string; // Display label (e.g., "Species Observed")
  description?: string; // Optional description shown as a caption while filling the form
  required?: boolean; // Is this field required?
  options?: CustomFieldOption[]; // Options for select/radio/checkbox types
  min?: number; // Min value for number/rating
  max?: number; // Max value for number/rating
  unit?: string; // Optional unit of measurement for number fields (e.g. "cm", "kg")
  default_value?: any; // Default value for the field
  validation?: {
    // Optional validation rules
    pattern?: string; // Regex pattern for text validation
    min_length?: number;
    max_length?: number;
    custom_error?: string; // Custom error message
  };
  // Only present when type === "repeatable_group": defines the per-item sub-fields.
  // Never itself contains a field of type "repeatable_group" (no nesting).
  itemFields?: CustomFieldConfig[];
}

// Ids of prefab scientific modules (modules/registry.ts) a custom
// protocol section can attach instead of composing its own fields. Grows as
// more native-protocol modules are exposed to the catalog.
export type SharedModuleRef = "vegetation" | "geoecological_constraints" | "impacts";

// Section grouping fields together
export interface CustomSection {
  id: string; // Unique section ID (e.g., "fauna_observations"). When moduleRef is
  // set, MUST equal the shared module's id ("vegetation"/"geoecological_constraints") -
  // this is the key that ties data <-> renderer <-> export columns together.
  title: string; // Section title (e.g., "Fauna Observations")
  description?: string; // Optional section description
  fields: CustomFieldConfig[]; // Array of fields in this section. Empty when moduleRef is set.
  collapsible?: boolean; // Can this section be collapsed?
  collapsed_by_default?: boolean; // Is it collapsed by default?
  // When set, this section IS a prefab scientific module (e.g. Vegetation/
  // Küchler, Soil) instead of a set of generic fields - see
  // modules/registry.ts and buildCustomModuleDescriptor().
  moduleRef?: SharedModuleRef;
}

// The complete custom protocol schema
export interface CustomProtocolSchema {
  sections: CustomSection[]; // Array of sections
  metadata?: {
    // Optional metadata
    version: string;
    created_by?: string;
    tags?: string[];
    exported_at?: string; // Timestamp when the protocol was exported
  };
}

// Custom protocol entity in the database
export interface CustomProtocol {
  id: number; // Auto-generated ID
  name: string; // Protocol name (e.g., "Wildlife Survey")
  theme: string; // Free-text theme/category, shown in "Meus Projetos"
  description?: string; // Protocol description
  collection_instructions?: string; // Instructions for data collection in the field
  schema: CustomProtocolSchema; // The complete schema (stored as JSON)
  created_at: string; // Creation timestamp
  updated_at: string; // Last update timestamp
}

// ============================================
// VEGETATION CLASSIFICATION TYPES
// ============================================

// Represents a single vegetation class in a custom classification
export interface VegetationClass {
  id: string; // Unique identifier for the class (e.g., "class_001", UUID, or generated ID)
  name: string; // Display name of the class (e.g., "Cerrado Sensu Stricto")
  description?: string; // Optional description of the class
}

// Represents a custom vegetation classification created by the user
export interface VegetationClassification {
  id: number; // Auto-generated ID
  project_id: number; // Associated project ID
  name: string; // Name of the classification (e.g., "My Custom Vegetation Classification")
  classes: VegetationClass[]; // Array of vegetation classes in JSON format
  created_at: string; // Creation timestamp
  last_updated: string; // Last update timestamp
}

// Represents a project-level species entry with support for multiple common names (from GBIF or manual entry)
export interface ProjectSpeciesCatalog {
  id: number; // Auto-generated unique identifier
  project_id: number; // Associated project ID
  scientific_name: string; // Latin name (required)
  family?: string; // Plant family (optional, from GBIF)
  genus?: string; // Plant genus (optional, from GBIF)
  gbif_id?: string; // GBIF occurrence ID if from GBIF API
  source: "gbif" | "manual" | "specieslink" | "catalog"; // Source of the species data
  created_at: string; // Creation timestamp
  last_updated: string; // Last update timestamp
  common_names?: ProjectSpeciesCommonName[]; // Multiple common names with language support
}

// Represents a common name for a species with language support
export interface ProjectSpeciesCommonName {
  id: number;
  species_id: number;
  common_name: string;
  language: string; // Language code: pt, en, es, fr
  source: "gbif" | "manual" | "specieslink" | "catalog";
  created_at: string;
}

// Input type for creating project-level species entries
export type ProjectSpeciesCatalogInput = Omit<
  ProjectSpeciesCatalog,
  "id" | "created_at" | "last_updated" | "common_names"
> & {
  common_names?: Array<Omit<ProjectSpeciesCommonName, "id" | "species_id" | "created_at">>;
};

// Input for common names (species_id is passed as a separate parameter to addCommonNameToSpecies)
export type ProjectSpeciesCommonNameInput = Omit<
  ProjectSpeciesCommonName,
  "id" | "created_at" | "species_id"
>;

// ============================================
// SPECIES TYPES
// ============================================

// Represents a species recorded at a survey point
export interface Species {
  id: number; // Auto-generated unique identifier
  project_id: number; // Associated project ID
  point_id: number; // Associated point ID (tabela points)
  scientific_name?: string; // Latin name (optional, but at least one name is required)
  common_names?: string[]; // Popular/common names (optional, but at least one name is required); UI convention is a single semicolon-separated text field
  genus?: string; // Genus classification (optional)
  family?: string; // Family classification (optional)
  abundance: number | null; // Number of individuals of this species at the point (optional, minimum 1 when informed)
  created_at: string; // Creation timestamp
  last_updated: string; // Last update timestamp
}

// Input type for creating a new species record (omits auto-generated fields)
export type SpeciesInput = Omit<Species, "id" | "created_at" | "last_updated">;

// Statistics about species diversity at a survey point
export interface SpeciesDiversity {
  point_id: number; // ID do ponto
  total_species_count: number; // Number of unique species at this point
  total_individuals: number; // Total number of individuals (sum of all abundances)
  species_list: Array<{
    id: number;
    scientific_name?: string;
    common_names?: string[];
    abundance: number | null;
  }>;
}

// Statistics about species occurrence across a project
export interface SpeciesOccurrence {
  species_id: number; // ID of the species
  scientific_name?: string; // Latin name
  common_names?: string[]; // Popular names
  occurrence_count: number; // Number of points where this species occurs
  total_survey_points: number; // Total points in the project
  occurrence_rate: number; // Percentage of occurrence (0-100)
}

