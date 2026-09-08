# 04. Directory structure

Real tree of `mobile-app/` (confirmed via `find`, ignoring `node_modules`, `.expo`, `.git`, and `__tests__` folders), annotated folder by folder. Key files are called out within each folder; for the complete file-by-file list, see the layer-specific documents.

```
mobile-app/
├── app/                        Expo Router (screens). See 09_SCREEN_FLOW.md
├── core/                       protocol-agnostic core
├── modules/                    protocol implementations (paisageo/, custom/, generic/, registry.ts)
├── protocol-kernel/            plugin machinery
├── db/                         SQLite, queries, mappers
├── components/                 shared UI components (not protocol-specific)
├── contexts/                   React providers (i18n, theme, map, kernel)
├── hooks/                      custom hooks
├── types/                      domain types (database)
├── utils/                      standalone utilities (i18n, azimuth, date/time validation)
├── constants/                  visual theme, button shape tokens
├── locales/                    global UI translations (pt/en/es/fr)
├── assets/                     images, logos, static PAISAGEO protocol JSON
├── package.json, tsconfig.json, eas.json, app.config.js
```

## `app/`

Screens via Expo Router v6 (file-based routing), organized into groups:

```
app/
├── _layout.tsx                 root layout: provider stack + database bootstrap
├── about.tsx
├── (tabs)/                     _layout.tsx, index.tsx (home), help.tsx, settings.tsx
├── (projects)/
│   ├── projects.tsx            project list
│   ├── project/new.tsx         create project
│   ├── project-details/[id].tsx        the SINGLE details screen (PAISAGEO and custom)
│   ├── project-collaboration/[id].tsx  collaboration hub: make collaborative, member auto-approval, submit/resync points
│   ├── project-approvals/[id].tsx      admin queue: approve/reject pending submissions on Drive
│   ├── protocol/builder.tsx    the "Personalized" protocol builder
│   ├── protocol/native-catalog.tsx  catalog/picker of native scientific protocols (today only paisageo)
│   ├── protocol/tutorials.tsx  tutorials screen (protocol picker + step-by-step guide), reads constants/protocol-tutorials.ts
│   ├── species-catalog/[id].tsx
│   └── view-map.tsx
└── (survey)/
    ├── insert-location.tsx     captures GPS before collecting a point
    ├── survey/form.tsx         manifest-driven collection form
    └── survey-point-details/[id].tsx    details of an already-collected point
```

**Update:** `project-details-custom/[id].tsx` — an earlier compatibility shim that just redirected to `project-details/[id]` — has since been removed entirely; there is now exactly one details screen, `project-details/[id].tsx`, for both PAISAGEO and custom projects. `app/modal.tsx`, an unused Expo template screen, is also gone. `view_map.tsx` and `insert_location.tsx` were renamed to kebab-case (`view-map.tsx`, `insert-location.tsx`).

See [09_SCREEN_FLOW.md](09_SCREEN_FLOW.md) for the full navigation map between these screens.

## `core/`

Protocol-agnostic services and components — never imports from `modules/` or `app/`, no exceptions. Imports from `protocol-kernel/` only via `import type` (never by value) — a documented, test-verified exception (see [01_ARCHITECTURE.md](01_ARCHITECTURE.md)). One sub-folder, `drive-sync/`, also imports directly from `db/queries/*` (collaboration sync needs to read/write projects, points, and members) — the only place in `core/` that talks to SQLite directly; see [12_COLLABORATION.md](12_COLLABORATION.md).

```
core/
├── export/
│   ├── generic-export-engine.ts   buildProtocolExportPlan (export engine), BASE_POINT_COLUMNS
│   ├── file-writer.ts             escapeCsv, writeAndShare, exportMedia
│   ├── types.ts                   re-exports AudioNote, MediaFiles, ProtocolExporter from protocol-kernel/types.ts
│   └── __tests__/
├── schema/
│   ├── module-schema.ts     validateModuleSchema
│   ├── dynamic-columns.ts   buildColumns (dynamic column expansion, used by generic-export-engine.ts)
│   └── __tests__/
├── species-catalog/
│   ├── gbif.ts                    GBIF integration
│   ├── specieslink.ts              SpeciesLink integration
│   ├── api-key-manager.ts          API keys (expo-secure-store)
│   ├── group-by-taxonomy.ts        groups search results by taxonomy
│   ├── search-progress.ts          batch-search progress state (UI)
│   └── species-catalog-sharing.ts  JSON catalog export/import
├── google-auth/
│   └── google-auth-service.ts      signInWithGoogle, getCurrentGoogleAccount, signOutFromGoogle, getDriveAccessToken (drive.file scope only)
└── drive-sync/
    ├── drive-api-client.ts              raw Google Drive REST v3 wrapper (createFolder, shareWithEmail, uploadJsonFile...)
    ├── project-drive-service.ts         manifest, membership, invites, promotion, join (inviteCollaboratorByEmail, promoteToAdmin...)
    ├── project-sync-service.ts          pulls approved points/members from Drive into local SQLite
    ├── point-submission-service.ts      uploads a local point to Drive for approval
    ├── approval-service.ts              admin approve/reject queue for pending submissions
    ├── reference-data-sync-service.ts   shared species catalog / vegetation classification sync
    └── point-label.ts                   pure display-label helper
```

## `modules/`

Protocol implementations — its own layer, a sibling of `core/`, `protocol-kernel/`, and `app/`, not nested inside any of them. Each protocol — native (`paisageo`) or custom (`custom`) — lives entirely inside `modules/<protocol>/`, and imports `core/` and `protocol-kernel/` freely. `modules/generic/` is the schema-driven rendering engine, with no protocol identity, used by either — it never imports any `modules/<protocol>/` (not even by type) nor `protocol-kernel/` by value. `modules/registry.ts` is the cross-protocol reuse aggregator (see [06_KERNEL_AND_CAPABILITIES.md](06_KERNEL_AND_CAPABILITIES.md)); `modules/bootstrap.ts` is the composition root that instantiates the kernel's `ProtocolRegistry` and registers the concrete manifests — the only two files outside `modules/<protocol>/` itself authorized to know `paisageo`/`custom` by name.

```
modules/
├── registry.ts              catalog of shared scientific modules: getSharedModule(),
│                             listSharedModules(), listBuilderAttachableModules() — today exposes
│                             the 3 PAISAGEO modules (vegetation, geoecological_constraints, impacts)
│                             for the Personalized protocol builder to "attach" without a direct import
├── bootstrap.ts              bootstrapProtocols: composition root that creates the ProtocolRegistry and
│                             registers paisageoManifest + customManifest (consumed by
│                             contexts/protocol-registry-context.tsx)
├── generic/
│   ├── FieldRenderer.tsx                       generic field renderer (custom protocol)
│   ├── NotesListInput.tsx                       free-text notes list (no protocol identity)
│   ├── GenericFieldRow.tsx                      one field row inside the generic renderer
│   ├── GenericModuleRenderer.tsx                fallback module renderer, driven by ModuleSchema
│   ├── RepeatableGroupField.tsx                  repeatable field-group UI (custom)
│   ├── module-renderer-registry.ts               ModuleRendererRegistry (interactive renderers)
│   ├── module-read-only-renderer-registry.ts     ModuleReadOnlyRendererRegistry (detail renderers)
│   └── read-only-display.ts                      generic read-only display helpers
├── paisageo/
│   ├── manifest.ts          declares the 3 modules, provides, exporter
│   ├── renderers.ts         paisageoRendererBindings (module → component, collection)
│   ├── read-only-renderers.ts  paisageoReadOnlyRendererBindings (module → component, details)
│   ├── exporter.ts          factory (lazy-loads services/export.ts)
│   ├── point-level-fields.ts  FieldSchema for point-level fields (size, photos, notes, audio, species)
│   ├── modules/
│   │   ├── vegetation/                    vegetation.module.ts, schema.ts, serde.ts, kuchler-config.ts,
│   │   │                                   section-titles.ts, VegetationModuleRenderer.tsx, VegetationModuleReadOnlyRenderer.tsx
│   │   ├── geoecological-constraints/      geoecological-constraints.module.ts, schema.ts, serde.ts,
│   │   │                                   GeoecologicalConstraintsModuleRenderer.tsx, GeoecologicalConstraintsModuleReadOnlyRenderer.tsx
│   │   │                                   (merger of geomorphology/relief + cover/surface + soil profile
│   │   │                                   into a single module, `id: "geoecological_constraints"`)
│   │   └── impacts/                       impacts.module.ts, schema.ts, serde.ts, impact-types-config.ts,
│   │                                       ImpactsModuleRenderer.tsx, ImpactsModuleReadOnlyRenderer.tsx
│   ├── capabilities/
│   │   ├── index.ts                  paisageoCapabilities (aggregates the 2 below)
│   │   ├── vegetation-classifier.ts  provides kuchler.classifyVegetation
│   │   └── landscape-naming.ts       provides landscape.generateName
│   ├── services/            real implementation: kuchler-formula.ts, vegetation_classifier.ts,
│   │                        landscape-naming.ts, export.ts (paisageoExporter), export-columns.ts
│   │                        (EXTRA_POINT_COLUMNS specific to paisageo)
│   ├── components/           protocol-specific UI: KuchlerMatrix, SoilProfileInput, SoilOptionPicker,
│   │                        ImpactList, SurfaceCoverInput, VegetationClassesModal,
│   │                        VegetationClassificationPicker, VegetationClassificationsManagementModal,
│   │                        VegetationPhysiognomyCard
│   │                        (NotesListInput lives in modules/generic/ — not Paisageo-specific)
│   └── types/soil.ts       SiBCS types (SoilLayer, SoilProfileData, etc.), consumed by the
│                             geoecological-constraints/ module (soil profile) via serde.ts
│
└── custom/
    ├── manifest.ts           customManifest + buildCustomModuleDescriptor (generates modules at runtime,
    │                         including from a CustomSection.moduleRef pointing to the registry above)
    ├── services/export.ts    customExporter (uses buildProtocolExportPlan from core, no EXTRA_POINT_COLUMNS)
    ├── slugify-field-key.ts   slugifyFieldKey/collectFieldKeys (stable column key per field)
    ├── config/field-types.ts  catalog of field types offered in the builder (CustomFieldType)
    └── components/OptionsListInput.tsx
```

## `protocol-kernel/`

The plugin machinery. Doesn't know any protocol by name — not even the composition root (`modules/bootstrap.ts`, which registers `paisageo`/`custom`) lives in here. Never imports from `core/` in any form: `AudioNote`/`MediaFiles`/`ProtocolExporter` are defined here, in `types.ts`; `core/export/types.ts` re-exports from here, not the other way around.

```
protocol-kernel/
├── types.ts              every contract (Manifest, ModuleDescriptor, Capability*, Registry, Bus...)
├── registry.ts            createProtocolRegistry (registration + topological resolution)
├── capability-bus.ts       createCapabilityBus
├── index.ts
└── __tests__/                includes layer-rules.test.ts — the permanent, data-driven static check
                              of the entire layer ordering (not just protocol isolation)
```

## `db/`

Generic, schema-driven SQLite.

```
db/
├── initialize.ts             DDL for every table + PAISAGEO protocol seed
├── mappers/
│   ├── point.mapper.ts        mapPointFromDb, buildPointWithModules, buildPointEnvelope
│   ├── species.mapper.ts
│   ├── project-species.mapper.ts
│   ├── protocol.mapper.ts
│   ├── custom-protocol.mapper.ts
│   └── json-utils.ts          parseJsonText, ensureJsonText
└── queries/
    ├── points.ts               createPoint, getPoint, updatePoint, deletePoint, classifyProjectPoints...
    ├── species.ts
    ├── project-species.ts       project species catalog (sources: manual/gbif/specieslink/catalog)
    ├── projects.ts
    ├── protocol.ts               "official" protocols (today only paisageo, seeded in initialize.ts)
    ├── custom-protocols.ts       CRUD for the Personalized protocol
    └── vegetation-classifications.ts   per-project vegetation classes (already generic, no paisageo/ subfolder)
```

## `components/`

Reusable UI components, not specific to a protocol (protocol-specific ones live inside `modules/paisageo/components/`). The generic field renderer (`FieldRenderer.tsx`, with `AzimuthInput` and the `percentage`/`azimuth`/`rating`/`date`/`time` cases) doesn't live here — it's in `modules/generic/`.

```
components/
├── ui/            IconSymbol.tsx (+.ios.tsx), CardHeaderIconButton.tsx, InfoBubble.tsx, ScrollJumpButtons.tsx
├── media/          PhotoInput.tsx, AudioNotesInput.tsx
├── species/        SpeciesManagementModal.tsx, SpeciesSearchProgressDialog.tsx,
│                   FamilyGenusCollapsibleTree.tsx, SpeciesResultCard.tsx
├── survey/          InsertLocationModal.tsx, SpeciesInput.tsx, SurveySelect.tsx
├── map/            MapLegend.tsx, LayerMenu.tsx, map-overlay-styles.ts — map overlays (see 09_SCREEN_FLOW.md)
├── settings/        SpeciesLinkSettingsModal.tsx
├── ErrorBoundary.tsx, HapticTab.tsx
```

## `contexts/`

```
contexts/
├── protocol-registry-context.tsx   kernel singletons + Context API (see 01_ARCHITECTURE.md)
├── i18n-context.tsx                 I18nProvider, useI18n, t()
├── theme-context.tsx                 dark/light mode
└── map-data-context.tsx              shared map state
```

## `hooks/`

```
hooks/
├── use-app-bootstrap.ts        calls initDatabase() on app start
├── use-protocol-translations.ts translateField/translateProtocol (LocalizedString → string)
├── use-dialog.tsx                dialog/modal helper, exposes DialogProvider (app/_layout.tsx)
├── use-location-permission.ts   requests/checks GPS permission (expo-location)
├── use-scroll-to-input.ts       scrolls the form to the focused field (keyboard)
├── use-stable-text-input.ts     avoids re-injecting `value` into a focused TextInput (Android flicker bug)
├── use-bottom-content-padding.ts  bottom padding to clear floating UI/safe area
├── use-scroll-overflow.ts       tracks whether scrollable content overflows its container
├── use-google-account.ts        wraps core/google-auth/google-auth-service.ts (account, connect, disconnect)
└── use-color-scheme.ts (+.web.ts)
```

## `types/`, `utils/`, `constants/`, `locales/`, `assets/`

- **`types/database.ts`**: domain interfaces (Point, Project, Species, Protocol, CustomProtocol, CustomSection, CustomFieldConfig, etc.) used by `db/` and the UI. **`types/index.ts`** is a barrel re-exporting `database.ts`.
- **`utils/`**: `i18n.ts` (`locales/*.json` loading + language persistence), `azimuth.ts` (azimuth conversion/formatting), `date-time-input.ts` (date/time digit validation and formatting, used by `FieldRenderer.tsx`).
- **`constants/theme.ts`**: palette and typography (Material Design 3, RN Paper). **`constants/shape.ts`**: shared rounded-rectangle button-shape tokens. **`constants/native-protocols-catalog.ts`**: `NATIVE_PROTOCOLS_CATALOG`, descriptive text (workflow + per-module description) for the native scientific protocol catalog shown in `app/(projects)/protocol/native-catalog.tsx` — today only has the `paisageo` entry; purely presentational, doesn't affect `ProtocolRegistry`. **`constants/protocol-tutorials.ts`**: `PROTOCOL_TUTORIALS`, the step-by-step tutorial content (sections → steps, each with icon/title/description) shown in `app/(projects)/protocol/tutorials.tsx`, with one entry per manifest `id` (`paisageo` and `custom` — the latter documents the generic custom-protocol mechanism, not one specific user instance). Same presentational pattern as `native-protocols-catalog.ts`: content only in `pt` for now, with `pt` fallback in other languages.
- **`locales/{pt,en,es,fr}.json`**: static UI strings (not protocol strings — see [08_I18N.md](08_I18N.md)).
- **`assets/protocols/paisageo/`**: `paisageo_protocol.json` and `vegetation_classes.json`, legacy static protocol JSON (referenced by the `protocols` table in the database, see [05_DATA_MODEL.md](05_DATA_MODEL.md)); `assets/images/`: icons and logos.
