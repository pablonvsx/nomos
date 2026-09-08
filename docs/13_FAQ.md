# 13. FAQ

## Where do I go to change a field in the soil form?

`modules/paisageo/modules/geoecological-constraints/schema.ts` (module `geoecological_constraints`, the merger of geomorphology/relief + cover/surface + soil profile). The fixed fields for the simple/detailed soil mode are in `soilProfileFields`; cover/surface fields are in `surfaceCoverFields`; both feed into `geoecologicalConstraintsSchema.fields`. Each layer's fields (detailed mode) are in `soilLayerItemFields`, used inside `geoecologicalConstraintsSchema.dynamic[0].itemFields`. If the field needs options (`select`/`multiselect`), remember to fill in `label` in all 4 languages. The UI that actually draws these fields is `modules/paisageo/components/SoilProfileInput.tsx` and `SurfaceCoverInput.tsx`, called from `modules/paisageo/modules/geoecological-constraints/GeoecologicalConstraintsModuleRenderer.tsx` — changing only the schema without touching those components changes the *data* and the *export*, but not necessarily the *visual form* (the specialized Renderer doesn't read `schema.fields` directly, unlike `GenericModuleRenderer`).

## How does the app decide which exporter to use?

`resolveManifestId(project)` (`contexts/protocol-registry-context.tsx`) maps `project.protocol_source === "custom" ? "custom" : project.protocol_id` to a manifest id. The screen/exporter then gets `registry.getProtocol(manifestId).exporter(deps)` to obtain the `ProtocolExporter` instance. There's no `if` by protocol name anywhere on this path — it's all resolved through the manifest.

## What happens if I forget to register a module in the manifest?

Unlike forgetting a `required` capability (which fails early in `resolve()`, with an explicit `missing_capability` error), forgetting a module in `manifest.modules` **produces no error at all**. Silent consequences:
- The module doesn't show up in the collection form (`survey/form.tsx` only iterates the manifest's modules).
- Data eventually written to it (if something writes directly to `point_modules` for that `module_id`) isn't deserialized correctly when read back (`buildPointWithModules` falls back to raw `JSON.parse`, without using `descriptor.deserialize`).
- The module doesn't show up in the export (PAISAGEO's exporter reads `manifest.modules` directly — see the next question).

## My new module shows up in the manifest but not in the CSV/GeoJSON — what did I forget?

**History (fixed):** an earlier version of this repository had `modules/paisageo/services/export.ts` keep its own constant (`PAISAGEO_MODULES`), independent from the list in `manifest.ts` — a module had to be added to both lists, and the two could get out of sync (affecting exported column order). That's been fixed: `services/export.ts` now imports `paisageoManifest` and uses `paisageoManifest.modules` directly, with no separate list. If your module is in `manifest.modules` and still doesn't appear in the export, the problem is something else — check whether some field's `exportable` was accidentally set to `false`, or whether the `module_id` matches the key used in `point.modules` (see [11_GUIDE_NEW_MODULE.md](11_GUIDE_NEW_MODULE.md)).

## How do I decide between a specialized Renderer and `GenericModuleRenderer`?

You don't decide it at write time — the UI decides at runtime, module by module, by looking at the `ModuleRendererRegistry`:

```typescript
// app/(survey)/survey/form.tsx (summarized)
const Renderer = rendererRegistry.get(moduleId) as React.ComponentType<any> | undefined;
if (Renderer) return <Renderer value={value} onChange={onChange} language={lang} onInfoPress={handleInfoPress} />;
return <GenericModuleRenderer module={module} value={value} onChange={onChange} language={lang} />;
```

If you registered a `ModuleRendererBinding` for that `moduleId` (in `contexts/protocol-registry-context.tsx`), it wins. Otherwise it falls back to the generic one, which draws field by field from `module.schema.fields` — good enough for most simple cases, but without specialized widgets (e.g. the Kuchler matrix wouldn't be usable as a plain list of generic fields).

## Where do a protocol field's translations live? Why aren't they in `locales/`?

See [08_I18N.md](08_I18N.md). Short version: UI strings (menus, buttons) come from `locales/*.json` via `t()`; protocol field labels (`FieldSchema.label`) are `LocalizedString` objects embedded directly in each module's `schema.ts`, resolved at runtime by `field.label[language] ?? field.label["pt"]` or by `useProtocolTranslations().translateField()`.

## My data disappeared after restarting the app. Why?

Probably not this anymore: `db/initialize.ts` currently has `RESET_DATABASE_ON_INIT = false` — data persists normally between restarts now. But the mechanism still exists in the code: if someone flips that flag back on manually for debugging, every app start goes back to dropping and recreating every table (`resetDatabase()`), and that's the most likely cause of "data loss" in that scenario. If data disappears without that flag being on, the problem is something else (not the app's expected/documented behavior).

## How does a protocol reuse something from another without a direct import?

Depends on what you want to reuse. See [06_KERNEL_AND_CAPABILITIES.md](06_KERNEL_AND_CAPABILITIES.md) for the details of both:
- **An entire module** (schema + serde + renderers) — the real path today: `modules/registry.ts` (`getSharedModule`/`listBuilderAttachableModules`). This is how the custom-protocol builder attaches a PAISAGEO scientific module to a section.
- **An isolated function via `CapabilityBus`** — the pattern is `bus.get(id)` followed by a `null` check before `.invoke()`. The mechanism works and is used today, but only by screens in `app/` consuming PAISAGEO capabilities (genuinely, for `landscape.generateName`; `kuchler.classifyVegetation` is registered but today only checked for presence, not invoked — see the next question) — no protocol currently consumes another's `requires` (the one example that existed was removed).

## `project-details-custom/[id].tsx` — does it still exist?

No. It used to be a compatibility shim — just a `<Redirect href={"/project-details/" + id} />` — kept around after PAISAGEO and custom projects were unified onto a single, manifest-driven details screen. That shim has since been removed entirely; `project-details/[id].tsx` is now the only details screen, for both PAISAGEO and custom projects, and there is no `project-details-custom` route anymore.

## Where does the scientific logic live (Kuchler, vegetation classification, landscape naming)?

Three scientific services in `modules/paisageo/services/`, but their relationship to the `CapabilityBus` differs:

- `services/kuchler-formula.ts` (`processKuchlerMatrix`): builds the raw formula and the Kuchler formula from the height×cover matrix. Called directly by `modules/paisageo/components/KuchlerMatrix.tsx` — **not** a `CapabilityBus` capability itself (an earlier `kuchler.buildFormula` capability was removed for lack of a real consumer outside its own test; see [06_KERNEL_AND_CAPABILITIES.md](06_KERNEL_AND_CAPABILITIES.md)). Internally, `kuchler-formula.ts` now also calls `classifyVegetation()` from `vegetation_classifier.ts` directly, as a plain function call within `modules/paisageo/`.
- `kuchler.classifyVegetation` (`services/vegetation_classifier.ts`, `classifyVegetation`): classifies the raw formula into a physiognomy (e.g. "Tropical Rain Forest"). It's still declared and registered as a `CapabilityDeclaration`, but today `app/(projects)/project-details/[id].tsx` only checks whether the active manifest provides it (`manifest?.provides?.some(c => c.id === "kuchler.classifyVegetation")`) — a presence check, not a `bus.get().invoke()` call.
- `landscape.generateName` → `services/landscape-naming.ts`: composes the final landscape name (vegetation + geomorphology + impacts), with per-language grammatical gender/number inflection. This one is genuinely invoked via the bus — `app/(survey)/survey/form.tsx` calls `bus.get("landscape.generateName")` and `.invoke()`s it when saving a point.

All three functions are "pure" (they take data, return data) and don't depend on UI or the database; the two still wrapped as capabilities are exposed via `capabilities/*.ts`, which just wrap the real implementation in a `CapabilityDeclaration`.
