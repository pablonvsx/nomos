# 05. Data model

## Overview

The database is plain SQLite (`expo-sqlite`, no ORM), initialized in `db/initialize.ts`. The core model is **schema-driven**: a collection point (`points`) has N associated module records (`point_modules`), each holding a JSON blob that only the protocol's `ModuleDescriptor` knows how to interpret (`serialize`/`deserialize`).

**Note:** `db/initialize.ts` defines `RESET_DATABASE_ON_INIT = false` — data persists normally between app restarts. The flag still exists as a development mechanism (`resetDatabase()`, which drops tables in reverse FK order), but it has to be flipped manually in the code to take effect — it is not the app's default behavior.

## Entity-relationship diagram

```mermaid
erDiagram
    PROJECTS ||--o{ POINTS : "has"
    POINTS ||--o{ POINT_MODULES : "has data in"
    POINTS ||--o{ SPECIES : "recorded at"
    PROJECTS ||--o{ PROJECT_SPECIES_CATALOG : "catalog of"
    PROJECT_SPECIES_CATALOG ||--o{ PROJECT_SPECIES_COMMON_NAMES : "common names"
    PROJECTS ||--o{ VEGETATION_CLASSIFICATIONS : "custom classification"
    PROJECTS }o--|| PROTOCOLS : "official protocol (if protocol_source=official)"
    PROJECTS }o--|| CUSTOM_PROTOCOLS : "custom protocol (if protocol_source=custom)"

    PROJECTS {
        int id PK
        string name
        string protocol_id "id in protocols or custom_protocols"
        string protocol_source "official | custom"
        string vegetation_classification_type "standard | custom"
        int active_custom_vegetation_classification_id
    }

    POINTS {
        int id PK
        int project_id FK
        string protocol_id "paisageo | custom"
        int point_number
        real lat
        real lon
        real altitude
        string generated_name
        int landscape_class_id
        text photos "JSON array, provisional"
        text audio_notes "JSON array, provisional"
        text additional_notes "JSON array, provisional"
        real point_size "provisional"
    }

    POINT_MODULES {
        int point_id PK_FK
        string module_id PK "vegetation | geoecological_constraints | impacts | custom id"
        string schema_version
        text data_json "ModuleDescriptor's serialize()"
    }

    SPECIES {
        int id PK
        int project_id FK
        int point_id FK
        string scientific_name
        string common_names "JSON array of strings, or NULL"
        string genus
        string family
        int abundance
    }

    PROJECT_SPECIES_CATALOG {
        int id PK
        int project_id FK
        string scientific_name
        string source "manual | gbif | specieslink | catalog"
    }
```

## The two central tables

### `points` (`db/initialize.ts:144-162`)

```sql
CREATE TABLE points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  protocol_id TEXT NOT NULL,            -- "paisageo" | "custom"
  point_number INTEGER NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  altitude REAL,
  generated_name TEXT,
  landscape_class_id INTEGER,
  photos TEXT,                          -- JSON array (provisional)
  audio_notes TEXT,                     -- JSON array (provisional)
  additional_notes TEXT,                -- JSON array (provisional)
  point_size REAL,                      -- plot size (provisional)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

The fields marked "provisional" in the source code's own comment (`photos`, `audio_notes`, `additional_notes`, `point_size`) live directly on the `points` table, not inside a module — they're point-level media/annotation data, not a `ModuleDescriptor`'s.

### `point_modules` (`db/initialize.ts:171-178`)

```sql
CREATE TABLE point_modules (
  point_id INTEGER NOT NULL,
  module_id TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  data_json TEXT NOT NULL,
  PRIMARY KEY (point_id, module_id),
  FOREIGN KEY (point_id) REFERENCES points(id) ON DELETE CASCADE
);
```

One record per (point, module). `data_json` is the result of `ModuleDescriptor.serialize(data)`; when read back, `ModuleDescriptor.deserialize(raw)` reconstructs the domain object — including applying legacy-format compatibility when needed (see the `impacts` module below).

## How serialize/deserialize bridge the gap

`db/mappers/point.mapper.ts` (`buildPointWithModules`) is the junction point between the raw SQLite row and the correct protocol's `ModuleDescriptor`:

```typescript
// db/mappers/point.mapper.ts
const manifest = registry.getProtocol(point.protocol_id);
for (const mod of modules) {
  const descriptor = manifest?.modules.find((m) => m.id === mod.module_id);
  try {
    deserializedModules[mod.module_id] = descriptor
      ? descriptor.deserialize(mod.data_json)
      : JSON.parse(mod.data_json);   // fallback if the descriptor doesn't exist
  } catch {
    deserializedModules[mod.module_id] = mod.data_json;
  }
}
```

This is then converted into the `PointEnvelope` (the contract the kernel and exporters understand) by `buildPointEnvelope()` (`db/mappers/point.mapper.ts`), which also deserializes `photos`/`audio_notes`/`additional_notes` (the point-level fields) via a small JSON-array-safe parser.

On write, `db/queries/points.ts`'s `createPoint()` receives `modules: Record<string, string>` — i.e., the caller (the form screen) must already have called `descriptor.serialize(data)` before assembling the `CreatePointInput`; the query itself just `INSERT`s the already-serialized JSON.

## Concrete example: a persisted PAISAGEO point

A point with soil in `detailed` mode (2 layers) and vegetation with 2 strata would look like this in the database:

**`points`** (1 row):
```
id=42, project_id=3, protocol_id="paisageo", point_number=5,
lat=-8.05, lon=-34.9, altitude=12,
generated_name="Dense Ombrophilous Forest on hillside setting, influenced by severe erosion",
landscape_class_id=2, photos='["file://p1.jpg"]', ...
```

**`point_modules`** (3 rows, one per module):

```
point_id=42, module_id="geoecological_constraints", schema_version="1",
data_json='{
  "exposure": "Leeward", "slope": "Gentle (5-10°)",
  "topographic_position": "Intermediate", "slope_shape": "Concave",
  "geomorphology_type": ["Hillside"],
  "litter_layer": "5-25%", "stoniness": "None", "rockiness": "None", "bare_soil": "None",
  "mode": "detailed",
  "soil_layers": [
    { "depth_start": "0",  "depth_end": "20", "texture": "loam", "structure": "granular",
      "color_pattern": "homogeneous", "color_primary": "reddish_brown", "cracks": "absent",
      "has_gravel": false, "has_roots": true, ... },
    { "depth_start": "20", "depth_end": "50", "texture": "clay", "structure": "massive",
      "color_pattern": "homogeneous", "color_primary": "yellow", "cracks": "narrow", ... }
  ]
}'

point_id=42, module_id="vegetation", schema_version="1",
data_json='{
  "raw_formula": "B7c,D7i",
  "kuchler_formula": "B7D7i",
  "total_strata": 2,
  "physiognomy_name": "Dense Ombrophilous Forest",
  "conservation_status": "conserved",
  "vegetation_strata": [
    { "height_id": "7", "height_range": ">35m", "life_form": "Broadleaf; Conifer",
      "cover_class": "Continuous; Intermediate", "leaf_adaptation": "" }
  ]
}'

point_id=42, module_id="impacts", schema_version="1",
data_json='{ "impacts": [ { "type": "Erosion", "magnitude": "Critical", "details": "sheet erosion" } ] }'
```

**Note:** geomorphology/relief and soil (cover/surface + profile) used to be two separate modules — and therefore two separate rows (`module_id="geomorphology"` and `module_id="soil"`). They were merged into a single `geoecological_constraints` module.

## Divergence: legacy `impacts` format

`modules/paisageo/modules/impacts/serde.ts` accepts two formats on deserialization:

1. **New** (current): `{ impacts: ImpactItem[] }` — a list of `{type, magnitude, details}` objects.
2. **Legacy**: `Record<string, { magnitude?, details?, observations? }>` — a map where the key was the impact type itself.

When reading a legacy `data_json`, `deserializeImpacts()` detects the format (it's an object, not an array, without an `impacts` array key) and automatically converts it to the new format, filling `details` from `details ?? observations`. This means older points remain readable without a database migration, and get written back in the new format the next time they're saved.

`modules/paisageo/modules/impacts/serde.ts` also has `toRecordJson`/`fromRecordJson`, a pair of converters between the array shape (`{impacts: ImpactItem[]}`) and the `Record<type, {magnitude, details}>` shape — used only to hydrate the `ImpactList` widget's checkbox state, not for persistence (persistence always stays in the new array format).

## `height_id` in `VegetationStratum`

The `height_id` field (Kuchler height-class code, e.g. `"7"` for `>35m`) is present in the current `VegetationStratum` (`modules/paisageo/modules/vegetation/serde.ts`) and in the schema (`modules/paisageo/modules/vegetation/schema.ts`, the `height_id` field of the `vegetation_strata` dynamic group). It was removed and later restored during an earlier refactor — the current code state already includes it normally, there's nothing pending here.

## Other tables

- **`projects`**: a project references a protocol via `protocol_id` + `protocol_source` (`'official'` or `'custom'`); `resolveManifestId()` (`contexts/protocol-registry-context.tsx`) translates that into the kernel's manifest id (`"paisageo"` or `"custom"`).
- **`protocols`**: catalog of "official" protocols; today it only contains the PAISAGEO seed (`nomos-paisageo-v1`), inserted near `db/initialize.ts:210-224`, referencing the legacy static JSON at `assets/protocols/paisageo/paisageo_protocol.json`. This JSON is no longer the source of the real manifest (that's `modules/paisageo/manifest.ts`); it's a holdover from the pre-refactor format.
- **`custom_protocols`**: JSON schema for each user-created Personalized protocol (`schema` holds a serialized `CustomProtocolSchema`). It has a `theme TEXT NOT NULL` column (`db/initialize.ts:78`) — a free-text category/theme label (e.g. "Fauna", "Flora"), shown in the "My Projects" listing; unrelated to the light/dark visual theme (`contexts/theme-context.tsx`), which is a separate concept — note that the kernel's `ProtocolManifest` type also grew its own, optional `theme?: LocalizedString` field for the same purpose at the manifest level (see [02_GLOSSARY.md](02_GLOSSARY.md)). A `CustomSection` inside this schema can have a `moduleRef?: SharedModuleRef` (`types/database.ts`): when present, the whole section *is* a shared PAISAGEO scientific module (vegetation, geoecological constraints, or impacts, looked up in `modules/registry.ts`), and `fields` is left empty — the alternative to fields defined manually by the user in the builder.
- **`species`**: species observed at a specific point. The old single `common_name TEXT` column was replaced by `common_names TEXT` (a JSON array of strings), matching the same multiple-common-names pattern already used by `project_species_common_names`; it also gained `genus`, `family`, `created_at`, `last_updated` (`db/initialize.ts:183-200`). There's a `CHECK (scientific_name IS NOT NULL OR common_names IS NOT NULL)` constraint. `db/mappers/species.mapper.ts` deserializes `common_names` into `string[]`.
- **`project_species_catalog` + `project_species_common_names`**: the project's species catalog (sources: `gbif`, `specieslink`, `manual`, `catalog` — the last from JSON catalog import/export via `core/species-catalog/species-catalog-sharing.ts`), not tied to a specific point.
- **`vegetation_classifications`**: custom per-project vegetation classifications (an alternative to automatic Kuchler classification). Queried via `db/queries/vegetation-classifications.ts` — already generic (not paisageo-specific), which is why it doesn't live inside `modules/paisageo/`.
