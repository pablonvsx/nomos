import type { ComponentType } from "react";

// ──────────────────────────────────────────────
// Primitives
// ──────────────────────────────────────────────

/** Multilingual text. Keys = language codes ("pt","en","es","fr"). */
export type LocalizedString = Record<string, string>;

export type LanguageCode = "pt" | "en" | "es" | "fr";

// ──────────────────────────────────────────────
// Field schema (schema-driven)
// ──────────────────────────────────────────────

export type FieldType =
  | "text"
  | "number"
  | "percentage"
  | "azimuth"
  | "boolean"
  | "select"
  | "multiselect"
  | "date"
  | "time"
  | "photo"
  | "audio"
  | "notes"
  | "species"
  | "location";

export interface FieldSchema {
  id: string;
  label: LocalizedString;
  type: FieldType;
  required?: boolean;
  options?: SelectOption[];
  unit?: string;
  min?: number;
  max?: number;
  exportable?: boolean; // default true
  /** UI rendering hint: preserves the builder's original type (CustomFieldType).
   *  Used by GenericModuleRenderer to pick the right component.
   *  Has no semantic meaning to the kernel. */
  renderAs?: string;
  /** Optional caption shown below the field while filling out the form. */
  description?: LocalizedString;
  /** UI rendering hints for select/multiselect fields, no semantic meaning to
   *  the kernel. `layout: "single_column"` shows one option per line instead
   *  of a two-column grid; `hideLabel` omits the field's own label (e.g. when
   *  a section title already names it); `optionDescMode: "inline"` shows each
   *  option's description as text below it instead of the default
   *  icon-tap-for-modal (used by GenericModuleRenderer for custom-protocol
   *  fields, see modules/custom/manifest.ts). */
  layout?: string;
  hideLabel?: boolean;
  optionDescMode?: "inline" | "modal";
  /** For `type: "number"` fields: hides the "Minimum: X / Maximum: Y" caption
   *  shown below the input, while still enforcing min/max on typing. Useful
   *  when the bound is an implementation detail (e.g. an area can't be
   *  negative) rather than something the user needs to be told. */
  hideRangeHint?: boolean;
}

export interface SelectOption {
  value: string;
  label: LocalizedString;
  /** Optional description of the option, shown while filling out the form. */
  desc?: LocalizedString;
}

/**
 * Dynamic group rule: variable-size collection within a module.
 * E.g.: soil layers, Kuchler vegetation strata.
 */
export interface DynamicGroupRule {
  groupId: string;
  itemFields: FieldSchema[];
  /**
   * Pattern for naming columns in the export.
   * Placeholders: {i} = 1-based index; {field} = field id.
   * E.g.: "soil_layer_{i}_{field}" → "soil_layer_2_color"
   */
  columnNamePattern: string;
  /** Optional friendly label for the group itself, for presentation only
   *  (e.g. a generic form renderer needing a title for the "add item" UI).
   *  Has no meaning to the kernel or the export engine. */
  label?: LocalizedString;
}

export interface ModuleSchema {
  fields: FieldSchema[];
  dynamic?: DynamicGroupRule[];
}

// ──────────────────────────────────────────────
// Module
// ──────────────────────────────────────────────

export interface ModuleRendererProps {
  value: unknown;
  onChange: (next: unknown) => void;
  language: LanguageCode;
  /** Shows a help-text bubble for a field/option/section. Optional: not every
   *  host screen wires this (e.g. a future read-only display might not). */
  onInfoPress?: (text: string) => void;
  /** When true, the renderer must not let the user edit the value (hide
   *  add/edit/remove affordances, disable inputs) while still showing the
   *  same visual structure used for collection. */
  readOnly?: boolean;
}

export interface ModuleDescriptor {
  id: string;
  title: LocalizedString;
  schema: ModuleSchema;
  serialize: (data: unknown) => string;
  deserialize: (raw: string) => unknown;
}

/** UI binding for a module. Lives outside the kernel, in the presentation layer. */
export interface ModuleRendererBinding {
  moduleId: string;
  Renderer: ComponentType<ModuleRendererProps>;
}

// ──────────────────────────────────────────────
// Capabilities
// ──────────────────────────────────────────────

export interface CapabilityContract<I = unknown, O = unknown> {
  id: string;
  inputExample?: I;
  outputExample?: O;
}

export interface CapabilityDeclaration<I = unknown, O = unknown> {
  id: string;
  version: string; // semver; present, NOT validated in v1
  contract: CapabilityContract<I, O>;
  implementation: (input: I) => O | Promise<O>;
}

export interface CapabilityRequirement {
  id: string;
  versionRange?: string; // accepted, NOT validated in v1
  optional?: boolean;
}

export interface CapabilityHandle<I = unknown, O = unknown> {
  id: string;
  version: string;
  invoke: (input: I) => O | Promise<O>;
}

// ──────────────────────────────────────────────
// Exporter
// ──────────────────────────────────────────────

export interface AudioNote {
  uri: string;
  duration: number;
  timestamp: number;
}

export interface MediaFiles {
  photos: string[];
  audioNotes: AudioNote[];
  notes: string[];
}

export interface ProtocolExporter {
  exportGeoJSON(points: PointEnvelope[], project: ProjectRef, language: LanguageCode): Promise<void>;
  exportCSV(points: PointEnvelope[], project: ProjectRef, language: LanguageCode): Promise<void>;
  extractMedia(point: PointEnvelope, project: ProjectRef): Promise<MediaFiles>;
}

export type ExporterFactory = (deps: ExporterDeps) => ProtocolExporter;

export interface ExporterDeps {
  bus: CapabilityBus;
}

export interface PointEnvelope {
  id: string;
  projectId: string;
  protocolId: string;
  pointNumber: number;
  lat: number;
  lon: number;
  altitude?: number;
  generatedName?: string;
  modules: Record<string, unknown>;
  // Optional fields for full export support (populated via buildPointEnvelope)
  photos?: string[];
  audioNotes?: Array<{ uri: string; duration: number; timestamp: number }>;
  additionalNotes?: string[];
  pointSize?: number;
  createdAt?: string;
  landscapeClassId?: number;
}

export interface ProjectRef {
  id: string;
  name: string;
  protocolId: string;
}

// ──────────────────────────────────────────────
// Protocol manifest
// ──────────────────────────────────────────────

export type ProtocolKind = "scientific" | "custom";

export interface ProtocolManifest {
  id: string;
  name: LocalizedString;
  version: string;
  authors: string[];
  description: LocalizedString;
  /** Free-text protocol category/theme, shown in "My Projects". */
  theme?: LocalizedString;
  kind: ProtocolKind;

  modules: ModuleDescriptor[];
  provides?: CapabilityDeclaration[];
  requires?: CapabilityRequirement[];

  exporter: ExporterFactory;
  localesRef?: string;
}

// ──────────────────────────────────────────────
// Kernel APIs
// ──────────────────────────────────────────────

export interface CapabilityBus {
  get<I, O>(id: string, versionRange?: string): CapabilityHandle<I, O> | null;
  has(id: string): boolean;
  list(): CapabilityDeclaration[];
}

export interface ProtocolRegistry {
  register(manifest: ProtocolManifest): void;
  resolve(): ResolvedGraph;
  getProtocol(id: string): ProtocolManifest | undefined;
  listProtocols(): ProtocolManifest[];
  getBus(): CapabilityBus;
}

export interface ResolvedGraph {
  loadOrder: string[];
  ok: boolean;
  errors: ResolutionError[];
}

export interface ResolutionError {
  protocolId: string;
  type: "missing_capability" | "duplicate_protocol" | "duplicate_capability";
  detail: string;
}

// ──────────────────────────────────────────────
// Schema engine
// ──────────────────────────────────────────────

export interface SchemaValidationResult {
  ok: boolean;
  errors: string[];
}

export interface ColumnDef {
  key: string;
  label: string;
}

export interface ColumnPlan {
  columns: ColumnDef[];
  rowFor: (
    pointModuleData: Record<string, unknown>
  ) => Array<string | number | null>;
}
