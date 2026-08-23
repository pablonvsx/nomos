# 11. Guide: adding a module to an existing protocol

Smaller in scope than building an entire protocol ([10_GUIDE_NEW_PROTOCOL.md](10_GUIDE_NEW_PROTOCOL.md)): you already have a protocol (e.g. `paisageo`) and want to add a new collection section — in the example below, a hypothetical "hydrography" section (presence of water bodies, distance, type).

**Note:** PAISAGEO's `geomorphology` module used to be cited here as the reference model for being the simplest — only fixed fields, no dynamic group. It was merged with `soil` into a single `geoecological_constraints` module, which has a dynamic group (`soil_layers`, inherited from the old `soil`). Today no PAISAGEO module is only fixed fields — the examples below use an isolated snippet (the old geomorphology block, which survives as an array of fields within the merged schema) to illustrate the shape of a schema **without** `dynamic`; if your new module genuinely has no variable-size collection, the final result is simply `{ fields: [...] }`, with no `dynamic` key.

## Step 1 — Create the module folder

```
modules/paisageo/modules/hydrography/
├── hydrography.module.ts
├── schema.ts
├── serde.ts
└── HydrographyModuleRenderer.tsx   (optional)
```

## Step 2 — Define the schema (fixed fields)

```typescript
// real reference (fixed-fields excerpt): modules/paisageo/modules/geoecological-constraints/schema.ts
export const hydrographySchema: ModuleSchema = {
  fields: [
    {
      id: "water_body_present",
      label: { pt: "Corpo d'água presente", en: "Water body present", es: "Cuerpo de agua presente", fr: "Plan d'eau présent" },
      type: "boolean",
    },
    {
      id: "water_body_type",
      label: { pt: "Tipo", en: "Type", es: "Tipo", fr: "Type" },
      type: "select",
      options: [
        { value: "river", label: { pt: "Rio", en: "River", es: "Río", fr: "Rivière" } },
        { value: "lake", label: { pt: "Lago", en: "Lake", es: "Lago", fr: "Lac" } },
      ],
    },
    // ...
  ],
};
```

If the section instead needed a variable-size collection (e.g. "N water bodies per point"), the reference model becomes `soil_layers` (inside `geoecological_constraints`) or `impacts` (which today is *only* a dynamic group, `fields: []`) — declare a `dynamic: [{ groupId, itemFields, columnNamePattern }]` (see Step 2 of [10_GUIDE_NEW_PROTOCOL.md](10_GUIDE_NEW_PROTOCOL.md)).

## Step 3 — `serialize`/`deserialize`

Absent any need for legacy compatibility, it's always this:

```typescript
export function serializeHydrography(data: unknown): string { return JSON.stringify(data); }
export function deserializeHydrography(raw: string): unknown { return JSON.parse(raw); }
```

## Step 4 — `ModuleDescriptor`

```typescript
// real reference: modules/paisageo/modules/geoecological-constraints/geoecological-constraints.module.ts
export const hydrographyModule: ModuleDescriptor = {
  id: "hydrography",
  title: { pt: "Hidrografia", en: "Hydrography", es: "Hidrografía", fr: "Hydrographie" },
  schema: hydrographySchema,
  serialize: serializeHydrography,
  deserialize: deserializeHydrography,
};
```

## Step 5 — Three registration points (none automatic)

A new module in an already-existing protocol needs to be added in **3 places**, all manual:

1. **The protocol's `manifest.ts`** — add it to the `modules` list:
   ```typescript
   // modules/paisageo/manifest.ts
   modules: [vegetationModule, geoecologicalConstraintsModule, impactsModule, hydrographyModule],
   ```
2. **The protocol's `renderers.ts`** — if the module has specialized UI:
   ```typescript
   // modules/paisageo/renderers.ts
   export const paisageoRendererBindings: ModuleRendererBinding[] = [
     // ...existing ones,
     { moduleId: "hydrography", Renderer: HydrographyModuleRenderer },
   ];
   ```
   If you skip this step, the module still works — `survey/form.tsx` falls back to `GenericModuleRenderer`, which draws the schema's fields automatically (see [09_SCREEN_FLOW.md](09_SCREEN_FLOW.md)). Optionally, there's a fourth registration point: the protocol's `read-only-renderers.ts` (`ModuleReadOnlyRendererBinding[]`), consulted only by the details screen — if skipped, it falls back to the generic read-only display.
3. **No additional registration is needed in `modules/bootstrap.ts`** — unlike a new protocol, a module doesn't need its own kernel registration; it already "travels" inside the manifest of the protocol it belongs to.

**If the new module is part of PAISAGEO**, also consider adding it to `BUILDER_ATTACHABLE_MODULE_IDS` in `modules/registry.ts`, so the Personalized protocol builder can offer to attach it whole (schema + serde + renderers) to a custom section, without the user having to recreate the fields manually (see [06_KERNEL_AND_CAPABILITIES.md](06_KERNEL_AND_CAPABILITIES.md)). This path ("attach a shared module") is an alternative to the rest of this guide on the custom-protocol side: a `CustomSection` with `moduleRef` skips the 3 manual registrations above entirely — it simply points to a module that already exists in the catalog.

## What happens automatically, with no extra code

- **Persistence**: as soon as the module appears in `manifest.modules`, `db/queries/points.ts` and `db/mappers/point.mapper.ts` already know how to serialize/deserialize its data via `descriptor.serialize`/`descriptor.deserialize` — no SQL schema change needed (`point_modules` is generic, one row per module).
- **CSV/GeoJSON export**: `buildProtocolExportPlan` (called by the protocol's exporter) iterates `manifest.modules`/the list of modules passed in, and already generates the new module's columns, including dynamic expansion if the schema has one. No need to touch `core/export/generic-export-engine.ts` or `core/schema/dynamic-columns.ts`. `modules/paisageo/services/export.ts` reads `paisageoManifest.modules` directly (it doesn't keep its own separate list) — a new module in `manifest.ts` already shows up in the export automatically, with no additional manual step.
