# 10. Guide: creating a brand-new scientific protocol

Step by step, with real examples taken from PAISAGEO. Assume a hypothetical `fauna` protocol (fauna census) purely to illustrate the shape — the code snippets cited are all real PAISAGEO code, not invented.

## Step 1 — Folder structure

Follow the `modules/paisageo/` pattern:

```
modules/fauna/
├── manifest.ts
├── renderers.ts
├── exporter.ts
├── modules/
│   └── <each-module>/
│       ├── <module>.module.ts
│       ├── schema.ts
│       ├── serde.ts
│       └── <Module>ModuleRenderer.tsx   (optional)
├── capabilities/        (optional, if you're exposing something)
└── services/            (real export/capability implementation)
```

## Step 2 — Define each module's `ModuleSchema`

A `ModuleSchema` has fixed fields (`fields`) and, if there are variable-size collections, dynamic groups (`dynamic`). Real example, a snippet of fixed fields from PAISAGEO's geoecological constraints module (the geomorphology/relief part of it, just `select` fields, no dynamic group):

```typescript
// modules/paisageo/modules/geoecological-constraints/schema.ts (excerpt)
const geomorphologyFields: FieldSchema[] = [
  {
    id: "exposure",
    label: { pt: "Exposição", en: "Exposure", es: "Exposición", fr: "Exposition" },
    type: "select",
    options: [
      { value: "Barlavento", label: { pt: "Barlavento", en: "Windward", es: "Barlovento", fr: "Côté au vent" } },
      // ...
    ],
  },
  // ... 4 more fields
];
```

**Note:** no PAISAGEO module today is *only* fixed fields — `geoecological_constraints`, `vegetation`, and `impacts` all have some `dynamic` group (soil layers, vegetation strata, impacts, respectively). The snippet above illustrates the shape of an isolated block of fixed fields; for a hypothetical module with no variable collection at all, the final shape would just be `{ fields: [...] }`, with no `dynamic` key.

If a module has a variable-cardinality collection (like soil layers), declare `dynamic`:

```typescript
// modules/paisageo/modules/geoecological-constraints/schema.ts
export const geoecologicalConstraintsSchema: ModuleSchema = {
  fields: [...surfaceCoverFields, ...geomorphologyFields, ...soilProfileFields],
  dynamic: [
    {
      groupId: "soil_layers",              // must match the key used in the data object
      itemFields: soilLayerItemFields,     // FieldSchema[] of ONE item in the collection
      columnNamePattern: "soil_layer_{i}_{field}",  // {i}=1-based index, {field}=field id
    },
  ],
};
```

**Rule not to forget:** `groupId` must be exactly the key the module's data object uses for the collection (e.g. `GeoecologicalConstraintsModuleData.soil_layers`). The column engine locates the array via `data[groupId]` (`core/schema/dynamic-columns.ts`); a mismatched name makes the dynamic expansion silently find nothing.

## Step 3 — Write `serialize`/`deserialize`

In most cases, it's plain JSON — most PAISAGEO modules do exactly this (`geoecological_constraints` only departs from this pattern to handle legacy compatibility for `geomorphology_type`, see below):

```typescript
// modules/paisageo/modules/vegetation/serde.ts (identical pattern)
export function serializeVegetation(data: unknown): string {
  return JSON.stringify(data);
}
export function deserializeVegetation(raw: string): unknown {
  return JSON.parse(raw);
}
```

It's only worth writing something more elaborate if you need **legacy-format compatibility**. The impacts module does this because its data format changed during an earlier refactor (and `geoecological_constraints` does something similar, simpler, for the `geomorphology_type` field, which used to be a serialized JSON string instead of an array — see `modules/paisageo/modules/geoecological-constraints/serde.ts`):

```typescript
// modules/paisageo/modules/impacts/serde.ts (summarized)
export function deserializeImpacts(raw: string): unknown {
  const parsed = JSON.parse(raw);
  if (/* already { impacts: ImpactItem[] } */) return parsed;
  if (/* old Record<string, {...}> format */) {
    return { impacts: Object.entries(parsed).map(([type, v]) => ({ type, magnitude: v.magnitude ?? "", details: v.details ?? v.observations ?? "" })) };
  }
  return { impacts: [] };
}
```

## Step 4 — Assemble the `ModuleDescriptor`

```typescript
// modules/paisageo/modules/geoecological-constraints/geoecological-constraints.module.ts (complete)
export const geoecologicalConstraintsModule: ModuleDescriptor = {
  id: "geoecological_constraints",
  title: {
    pt: "Condicionantes Geoecológicos",
    en: "Geoecological Constraints",
    es: "Condicionantes Geoecológicos",
    fr: "Contraintes Géoécologiques",
  },
  schema: geoecologicalConstraintsSchema,
  serialize: serializeGeoecologicalConstraints,
  deserialize: deserializeGeoecologicalConstraints,
};
```

## Step 5 — Create the Renderer and register the binding (optional, but typical)

If the module needs specialized UI (not just the generic fields), write a component that implements `ModuleRendererProps` (`{ value, onChange, language, onInfoPress?, readOnly? }`) and register it in the protocol's `renderers.ts`:

```typescript
// modules/paisageo/renderers.ts (complete)
export const paisageoRendererBindings: ModuleRendererBinding[] = [
  { moduleId: "vegetation", Renderer: VegetationModuleRenderer },
  { moduleId: "geoecological_constraints", Renderer: GeoecologicalConstraintsModuleRenderer },
  { moduleId: "impacts", Renderer: ImpactsModuleRenderer },
];
```

If you **don't** register a binding for a module, `survey/form.tsx` automatically falls back to `GenericModuleRenderer` (`modules/generic/GenericModuleRenderer.tsx`), which draws field by field from `ModuleSchema.fields` — it works with no custom UI at all, just visually less refined. There's an optional third binding, `ModuleReadOnlyRendererBinding`, used only on the details screen (`survey-point-details/[id].tsx`) — if not registered, that screen falls back to a generic read-only display (`modules/generic/read-only-display.ts`).

**This binding needs to be registered by hand in `contexts/protocol-registry-context.tsx`** (see Step 8) — declaring it in `renderers.ts` alone isn't enough, nothing reads it automatically.

## Step 6 — Expose capabilities (optional) via `provides`

If your protocol has logic that the UI itself (`app/`) wants to invoke without importing your `modules/<protocol>/` directly, declare it as a `CapabilityDeclaration`. Real PAISAGEO example, today invoked by `app/(survey)/survey/form.tsx` via `bus.get("landscape.generateName")`:

```typescript
// modules/paisageo/capabilities/vegetation-classifier.ts (complete)
export const kuchlerClassifyVegetation: CapabilityDeclaration<KuchlerClassifyInput, ClassificationResult> = {
  id: "kuchler.classifyVegetation",
  version: "1.0.0",
  contract: { id: "kuchler.classifyVegetation" },
  implementation: (input) => classifyVegetation(input.rawFormula, input.lang, input.contextFlags),
};
```

Aggregate every capability into a `capabilities/index.ts` (`paisageoCapabilities: CapabilityDeclaration[]`) and reference it from the manifest (Step 7, `provides` field). **Note:** a declared capability isn't always actually invoked through the bus — PAISAGEO's own `kuchler.classifyVegetation` is registered but today only checked for presence (`manifest?.provides?.some(...)`) rather than invoked, while `landscape.generateName` is genuinely invoked via `bus.get().invoke()` (see [06_KERNEL_AND_CAPABILITIES.md](06_KERNEL_AND_CAPABILITIES.md)). Either way, the real usage of `provides`/`CapabilityBus` today is always "the app consumes a protocol without importing it directly," never "protocol A consumes protocol B."

If, instead, your protocol **needs** another protocol's capability, declare it in `requires` (ideally `optional: true`, so it doesn't break if the other protocol isn't present) and consume it via `bus.get(id)` — never via a direct import. **Note:** there is currently no real example of this cross-protocol consumption via `requires` in the code — the one that used to exist (`custom` consuming `kuchler.buildFormula` from `paisageo`) was removed for lack of real usage (see [06_KERNEL_AND_CAPABILITIES.md](06_KERNEL_AND_CAPABILITIES.md)). Today's real pattern for cross-protocol reuse is different: attaching an entire `ModuleDescriptor` from another protocol via `modules/registry.ts`, not consuming an isolated capability — if what you want to reuse is a whole module (schema + serde + renderers), that's the path, also detailed in [06_KERNEL_AND_CAPABILITIES.md](06_KERNEL_AND_CAPABILITIES.md).

## Step 7 — Write the manifest

```typescript
// modules/paisageo/manifest.ts (complete)
export const paisageoManifest: ProtocolManifest = {
  id: "paisageo",
  name: { pt: "Paisageo", en: "Paisageo", es: "Paisageo", fr: "Paisageo" },
  // Stored as a plain integer ("1", "2", ...); the UI renders it as "v1.0",
  // "v2.0", etc. Bump this only when the Paisageo protocol itself changes.
  version: "1",
  authors: ["PAISAGEO/UFPE"],
  description: {
    pt: "Protocolo original do Nomos, elaborado para coleta de campo no contexto de mapeamento de paisagem.",
    en: "Original Nomos protocol, designed for field data collection in the context of landscape mapping.",
    es: "Protocolo original de Nomos, diseñado para la recolección de datos de campo en el contexto del mapeo de paisajes.",
    fr: "Protocole original de Nomos, conçu pour la collecte de données de terrain dans le cadre de la cartographie des paysages.",
  },
  theme: {
    pt: "Cartografia de Paisagem",
    en: "Landscape Mapping",
    es: "Cartografía de Paisaje",
    fr: "Cartographie du Paysage",
  },
  kind: "scientific",
  modules: [vegetationModule, geoecologicalConstraintsModule, impactsModule],
  provides: paisageoCapabilities,
  requires: [],
  exporter: createPaisageoExporter,
};
```

## Step 8 — Register in the composition root and the React context

Two registrations, in two different files — easy to forget one of them:

```typescript
// modules/bootstrap.ts
export function bootstrapProtocols(): ProtocolRegistry {
  const registry = createProtocolRegistry();
  registry.register(paisageoManifest);
  registry.register(customManifest);
  registry.register(faunaManifest);   // <- your new protocol
  const result = registry.resolve();
  // ...
}
```

```typescript
// contexts/protocol-registry-context.tsx
for (const b of paisageoRendererBindings) globalRendererRegistry.register(b);
for (const b of faunaRendererBindings) globalRendererRegistry.register(b);  // <- if it has specialized Renderers

// and, if it also has specialized read-only renderers (optional):
for (const b of faunaReadOnlyRendererBindings) globalReadOnlyRendererRegistry.register(b);
```

Forgetting the registration in `modules/bootstrap.ts` makes the protocol simply not exist for the app (it won't appear in the protocol list, `registry.listProtocols()` won't include it). Forgetting the renderer-binding registration (interactive or read-only) doesn't break anything — `GenericModuleRenderer`/`read-only-display.ts` cover the module, just without specialized UI.

## Step 9 — The generic exporter already works on its own

There's no need to write dynamic-column logic. Just implement the `ExporterFactory` calling the generic engine:

```typescript
// modules/paisageo/services/export.ts (pattern to repeat)
const FAUNA_MODULES = [censusModule /* , ... */];

async function exportGeoJSON(points: PointEnvelope[], project: ProjectRef, language: LanguageCode): Promise<void> {
  const plan = buildProtocolExportPlan(FAUNA_MODULES, points, language);
  const features = points.map((p) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [p.lon, p.lat, p.altitude ?? 0] },
    properties: plan.toGeoJSONProperties(p),
  }));
  // assemble the FeatureCollection and call writeAndShare()
}
```

`language` is received as a parameter, no longer fixed to `"pt"` — the export screen passes the app's active language (`useI18n().currentLanguage`), so the CSV/GeoJSON column labels come out in whatever language the user has selected (see [08_I18N.md](08_I18N.md)).

`buildProtocolExportPlan` (`core/export/generic-export-engine.ts`) already resolves point-level columns, each module's fixed fields, and the expansion of any `dynamic` group declared in the schema — no additional "figure out how many columns I need" code is necessary.

Then, in the manifest's factory, use a dynamic `import()` for lazy loading (the real pattern used by both existing protocols) — note that the factory implements all three `ProtocolExporter` methods, including `extractMedia`:

```typescript
// modules/paisageo/exporter.ts (complete)
export const createPaisageoExporter: ExporterFactory = (_deps) => ({
  async exportGeoJSON(points, project, language) {
    const { paisageoExporter } = await import("./services/export");
    return paisageoExporter.exportGeoJSON(points, project, language);
  },
  async exportCSV(points, project, language) {
    const { paisageoExporter } = await import("./services/export");
    return paisageoExporter.exportCSV(points, project, language);
  },
  async extractMedia(point, project) {
    const { paisageoExporter } = await import("./services/export");
    return paisageoExporter.extractMedia(point, project);
  },
});
```

## Final checklist

- [ ] `manifest.ts` with `id`, `name`, `version`, `modules`, `provides`, `requires`, `exporter` (and, optionally, `theme`).
- [ ] Each module: `ModuleSchema` (+ `dynamic` if there are variable collections), `serialize`/`deserialize`, `ModuleDescriptor`.
- [ ] (optional) `renderers.ts` with `ModuleRendererBinding[]` for modules with specialized UI.
- [ ] (optional) `read-only-renderers.ts` with `ModuleReadOnlyRendererBinding[]` for specialized detail UI.
- [ ] (optional) `capabilities/` if the UI (`app/`) needs to invoke something from the protocol without importing it directly.
- [ ] Registered in `modules/bootstrap.ts` (`registry.register(...)`).
- [ ] Renderer bindings (interactive and/or read-only) registered in `contexts/protocol-registry-context.tsx` (if any).
- [ ] Exporter implemented (all 3 `ProtocolExporter` methods, including `extractMedia`) by calling `buildProtocolExportPlan` — no manual dynamic-column logic.
