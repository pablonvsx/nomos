# 02. Glossary

Terms verified against `protocol-kernel/types.ts` and actual usage in the code, not copied from an earlier planning document. Where the meaning or shape changed since an earlier plan, that is called out explicitly.

## Protocol

An extensible, self-contained unit that implements a survey method. Represented in code by the `ProtocolManifest` type (`protocol-kernel/types.ts:215-231`). Two exist today: `paisageo` (`kind: "scientific"`) and `custom` (`kind: "custom"`).

## Manifest

A protocol's complete declaration: `ProtocolManifest`. Real fields:

```typescript
// protocol-kernel/types.ts:215-231
interface ProtocolManifest {
  id: string;
  name: LocalizedString;
  version: string;
  authors: string[];
  description: LocalizedString;
  theme?: LocalizedString;     // free-text category, shown in "My Projects"
  kind: ProtocolKind;          // "scientific" | "custom"
  modules: ModuleDescriptor[];
  provides?: CapabilityDeclaration[];
  requires?: CapabilityRequirement[];
  exporter: ExporterFactory;
  localesRef?: string;
}
```

**Divergence found:** `localesRef` exists on the type but isn't used by any real protocol. `modules/custom/manifest.ts` even declares `localesRef: ""`, and `modules/paisageo/manifest.ts` doesn't include it at all. There is no `modules/paisageo/locales/` in the current code (confirmed by searching the directory). See [08_I18N.md](08_I18N.md) for how translation actually works.

`theme` is a newer, optional field — a free-text category/theme label (e.g. `paisageoManifest.theme` is `{ en: "Landscape Mapping", ... }`), shown alongside a project in the "My Projects" listing. It's unrelated to the light/dark visual theme (`contexts/theme-context.tsx`), which is a separate concept — see the note on `custom_protocols.theme` in [05_DATA_MODEL.md](05_DATA_MODEL.md).

## Module

A collection unit within a protocol (e.g. Vegetation, Geoecological Constraints, Impacts in PAISAGEO). Represented by `ModuleDescriptor`:

```typescript
// protocol-kernel/types.ts:113-119
interface ModuleDescriptor {
  id: string;
  title: LocalizedString;
  schema: ModuleSchema;
  serialize: (data: unknown) => string;
  deserialize: (raw: string) => unknown;
}
```

**Divergence found:** an earlier design draft described a `Renderer: React.ComponentType<ModuleRendererProps>` field inside `ModuleDescriptor`. That doesn't exist in the actual code — the descriptor is purely data. See `ModuleRendererBinding` below and the note in [01_ARCHITECTURE.md](01_ARCHITECTURE.md).

## ModuleSchema

Describes a module's fields, including support for variable-size collections:

```typescript
// protocol-kernel/types.ts:91-94
interface ModuleSchema {
  fields: FieldSchema[];
  dynamic?: DynamicGroupRule[];
}
```

## DynamicGroupRule

Describes a variable-cardinality collection within a module (e.g. `soil_layers`, `vegetation_strata`, `impacts`):

```typescript
// protocol-kernel/types.ts:76-89
interface DynamicGroupRule {
  groupId: string;             // e.g. "soil_layers"
  itemFields: FieldSchema[];   // fields of EACH item in the collection
  columnNamePattern: string;   // e.g. "soil_layer_{i}_{field}"
  label?: LocalizedString;     // optional, presentation-only group label
}
```

`groupId` needs to match exactly the key used in the module's data object (e.g. `SoilModuleData.soil_layers`), because that's how the column engine locates the array (`point[group.groupId]`, in `core/schema/dynamic-columns.ts:19`). `label` is a newer, optional field with no meaning to the kernel or the export engine — it's there purely so a generic form renderer has a title for an "add item" UI.

## FieldSchema

Describes an individual field (fixed, or inside a dynamic group):

```typescript
// protocol-kernel/types.ts:16-63
type FieldType =
  | "text" | "number" | "percentage" | "azimuth" | "boolean"
  | "select" | "multiselect" | "date" | "time"
  | "photo" | "audio" | "notes" | "species" | "location";

interface FieldSchema {
  id: string;
  label: LocalizedString;
  type: FieldType;
  required?: boolean;
  options?: SelectOption[];
  unit?: string;
  min?: number;
  max?: number;
  exportable?: boolean;          // default true
  renderAs?: string;              // UI hint, no meaning to the kernel
  description?: LocalizedString;  // optional caption shown below the field
  layout?: string;                 // UI hint for select/multiselect ("single_column" = one option per line)
  hideLabel?: boolean;             // omits the field's own label
  optionDescMode?: "inline" | "modal"; // how an option's description is shown
  hideRangeHint?: boolean;         // hides the "Minimum/Maximum" caption on number fields
}
```

**Grown over time:** `percentage`, `azimuth`, `notes`, and `time` were added to `FieldType` after an earlier, smaller set (`text`/`number`/`boolean`/`select`/`multiselect`/`date`/`photo`/`audio`/`species`/`location`); `date` wasn't replaced, it just gained a sibling `time` type for separate time-of-day fields. `min`/`max` were added for numeric-field validation. More recently, `description` changed from a plain `string` to a full `LocalizedString`, and `layout`, `hideLabel`, `optionDescMode`, and `hideRangeHint` were added as presentation-only hints — none of them carry any meaning to the kernel or the export engine, they exist purely for `GenericModuleRenderer`/`FieldRenderer` to pick the right widget behavior.

`exportable: false` is used to exclude internal-state fields from export — e.g. the `matrix` and `leaf_matrix` fields of the vegetation module (`modules/paisageo/modules/vegetation/schema.ts`), which exist only to let the Kuchler matrix re-render, not to appear in the CSV.

**Note: `rating` is not a `FieldType`.** It's a `renderAs` value (a UI hint for the custom protocol), handled as `case "rating"` inside the switch in `modules/generic/FieldRenderer.tsx` — the kernel doesn't know what "rating" is, it only sees the real underlying `FieldType` (typically `number`).

## ModuleRendererBinding

Associates a `moduleId` with a React component. Lives outside the kernel, in the presentation layer:

```typescript
// protocol-kernel/types.ts:122-125
interface ModuleRendererBinding {
  moduleId: string;
  Renderer: ComponentType<ModuleRendererProps>;
}
```

Each protocol with specialized renderers declares an array of these bindings (e.g. `modules/paisageo/renderers.ts`), and something has to register them explicitly — today that happens in `contexts/protocol-registry-context.tsx`. There's a read-only sibling, `ModuleReadOnlyRendererBinding` (`modules/paisageo/read-only-renderers.ts`), used on the details screen instead of the collection screen, registered the same way.

## Capability

A reusable function a protocol exposes, today always for the UI itself to consume via `CapabilityBus` (e.g. `kuchler.classifyVegetation`, `landscape.generateName`, both from PAISAGEO) — there is currently no real case of one protocol consuming another's capability (see the note on `CapabilityRequirement` below):

```typescript
// protocol-kernel/types.ts:137-142
interface CapabilityDeclaration<I = unknown, O = unknown> {
  id: string;
  version: string;       // semver; present, NOT validated in v1
  contract: CapabilityContract<I, O>;
  implementation: (input: I) => O | Promise<O>;
}
```

**Divergence found:** `version`/`versionRange` exist on the types, but the real `CapabilityBus.get()` (`protocol-kernel/capability-bus.ts:20`) receives `_versionRange` with a leading underscore — the parameter is literally ignored. This matches an earlier design decision ("real validation comes in once there's a second consumer"), so it isn't an unexpected divergence, but it's worth recording that it's still unimplemented.

## CapabilityRequirement

Declared by a protocol that depends on another protocol's capability:

```typescript
// protocol-kernel/types.ts:144-148
interface CapabilityRequirement {
  id: string;
  versionRange?: string;
  optional?: boolean;
}
```

**Divergence found:** there is no real usage today. Both `modules/paisageo/manifest.ts` and `modules/custom/manifest.ts` declare `requires: []`. The one example that used to exist (`custom` consuming `kuchler.buildFormula` from `paisageo`, with `requires: [{ id: "kuchler.buildFormula", optional: true }]`) was removed: the capability never had a real consumer outside its own test, and was replaced by a different mechanism — custom reusing an entire scientific module via `modules/registry.ts`, rather than an isolated capability via `requires` (see [06_KERNEL_AND_CAPABILITIES.md](06_KERNEL_AND_CAPABILITIES.md)).

## Registry / ProtocolRegistry

The kernel component that registers manifests and resolves the dependency graph between them:

```typescript
// protocol-kernel/types.ts:243-249
interface ProtocolRegistry {
  register(manifest: ProtocolManifest): void;
  resolve(): ResolvedGraph;
  getProtocol(id: string): ProtocolManifest | undefined;
  listProtocols(): ProtocolManifest[];
  getBus(): CapabilityBus;
}
```

Implemented in `protocol-kernel/registry.ts` with topological sorting (Kahn's algorithm) to decide load order when protocols have dependencies on each other. Details in [06_KERNEL_AND_CAPABILITIES.md](06_KERNEL_AND_CAPABILITIES.md).

## Capability Bus / CapabilityBus

API to look up and invoke capabilities without knowing who implements them:

```typescript
// protocol-kernel/types.ts:237-241
interface CapabilityBus {
  get<I, O>(id: string, versionRange?: string): CapabilityHandle<I, O> | null;
  has(id: string): boolean;
  list(): CapabilityDeclaration[];
}
```

Implemented in `protocol-kernel/capability-bus.ts`, with an internal `_register()` that only `ProtocolRegistry` calls.

## Schema-driven data

A model where each module describes its own data's shape via `ModuleSchema`, letting the export engine (and, in principle, other protocols) read that data without knowing its structure ahead of time. This is what lets `core/export/generic-export-engine.ts` work for any module, PAISAGEO or custom, with no protocol-specific code.

## Generic Field

Not a type of its own in the code; it's simply a `FieldSchema` of a native type (`text`, `number`, `select`, etc.) used by both `GenericModuleRenderer` and `FieldRenderer`, both in `modules/generic/`, to draw the collection UI without knowing the protocol.

## PointEnvelope

The data contract the kernel and the exporters understand for a collection point whose modules have already been deserialized:

```typescript
// protocol-kernel/types.ts:184-201
interface PointEnvelope {
  id: string;
  projectId: string;
  protocolId: string;
  pointNumber: number;
  lat: number; lon: number;
  altitude?: number;
  generatedName?: string;
  modules: Record<string, unknown>;
  photos?: string[];
  audioNotes?: Array<{ uri: string; duration: number; timestamp: number }>;
  additionalNotes?: string[];
  pointSize?: number;
  createdAt?: string;
  landscapeClassId?: number;
}
```

Built from SQLite rows by `buildPointEnvelope()` in `db/mappers/point.mapper.ts`.

## ProtocolExporter

The contract every protocol exporter implements:

```typescript
// protocol-kernel/types.ts:172-176
interface ProtocolExporter {
  exportGeoJSON(points: PointEnvelope[], project: ProjectRef, language: LanguageCode): Promise<void>;
  exportCSV(points: PointEnvelope[], project: ProjectRef, language: LanguageCode): Promise<void>;
  extractMedia(point: PointEnvelope, project: ProjectRef): Promise<MediaFiles>;
}
```

**Note:** `core/export/types.ts` re-exports this exact type from the kernel (`export type { AudioNote, MediaFiles, ProtocolExporter } from "@/protocol-kernel/types"`) rather than declaring its own — a single definition, not two independent ones that happen to match. `language: LanguageCode` (the third parameter of `exportGeoJSON`/`exportCSV`) is no longer hardcoded to `"pt"` (see [07_EXPORT.md](07_EXPORT.md) and [08_I18N.md](08_I18N.md)), and `extractMedia` lives directly on this one kernel-level type, consumed by both `paisageoExporter` and `customExporter`.

## ExporterFactory

`type ExporterFactory = (deps: ExporterDeps) => ProtocolExporter` (`protocol-kernel/types.ts:178`). Each manifest declares one factory; in practice both `createPaisageoExporter` and the custom manifest's inline factory use dynamic `import()` to defer loading the real exporter until it's actually used.
