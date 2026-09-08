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
    PROJECTS ||--o{ PROJECT_MEMBERS : "collaborators (Drive-based, see 12_COLLABORATION.md)"
    PROJECTS }o--|| PROTOCOLS : "official protocol (if protocol_source=official)"
    PROJECTS }o--|| CUSTOM_PROTOCOLS : "custom protocol (if protocol_source=custom)"

    PROJECTS {
        int id PK
        string name
        string protocol_id "id in protocols or custom_protocols"
        string protocol_source "official | custom"
        string vegetation_classification_type "standard | custom"
        int active_custom_vegetation_classification_id
        boolean is_collaborative "0/1, default 0"
        string drive_folder_id "Drive folder id, once made collaborative"
        boolean auto_approve_default "0/1, default policy for new members"
    }

    POINTS {
        string id PK "TEXT/UUID, not auto-increment"
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
        string created_by "email of the member who collected it"
        string approval_status "local | pending | approved | rejected"
        string rejection_reason
        string drive_synced_at "Drive modifiedTime of the last sync"
    }

    POINT_MODULES {
        string point_id PK_FK
        string module_id PK "vegetation | geoecological_constraints | impacts | custom id"
        string schema_version
        text data_json "ModuleDescriptor's serialize()"
    }

    SPECIES {
        int id PK
        int project_id FK
        string point_id FK
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
        string uuid "stable id to reconcile across devices"
    }

    PROJECT_MEMBERS {
        int project_id PK_FK
        string member_email PK
        string role "collaborator | admin"
        string auto_approve "herda_projeto | true | false"
        string collector_code
    }
```

## The two central tables

### `points` (`db/initialize.ts:151-175`)

```sql
CREATE TABLE points (
  id TEXT PRIMARY KEY NOT NULL,         -- UUID string, not an auto-increment int (see note below)
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
  created_by TEXT,                      -- email of the collaborator who created it
  approval_status TEXT NOT NULL DEFAULT 'local'
    CHECK (approval_status IN ('local', 'pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  drive_synced_at TEXT,                 -- Drive modifiedTime of the last synced read/write
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
```

The fields marked "provisional" in the source code's own comment (`photos`, `audio_notes`, `additional_notes`, `point_size`) live directly on the `points` table, not inside a module — they're point-level media/annotation data, not a `ModuleDescriptor`'s.

**Note — `id` is now a UUID, not an auto-increment integer**: `points.id` was migrated from `INTEGER PRIMARY KEY AUTOINCREMENT` to `TEXT PRIMARY KEY NOT NULL` so a point created offline on any device already has a globally unique id before it's ever submitted to a collaborative project's Drive folder — no server round-trip needed to assign one. `point_modules.point_id` and `species.point_id` (both foreign keys into `points.id`) were migrated to `TEXT` accordingly. `approval_status`, `created_by`, `rejection_reason`, and `drive_synced_at` only matter for points inside a collaborative project — see [12_COLLABORATION.md](12_COLLABORATION.md); a point in a non-collaborative project simply stays at `approval_status='local'` forever.

### `point_modules` (`db/initialize.ts:183-191`)

```sql
CREATE TABLE point_modules (
  point_id TEXT NOT NULL,
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

- **`projects`**: a project references a protocol via `protocol_id` + `protocol_source` (`'official'` or `'custom'`); `resolveManifestId()` (`contexts/protocol-registry-context.tsx`) translates that into the kernel's manifest id (`"paisageo"` or `"custom"`). Three columns exist to support collaborative projects (`db/initialize.ts:71-73`): `is_collaborative INTEGER NOT NULL DEFAULT 0` (whether this project is backed by a shared Drive folder at all), `drive_folder_id TEXT` (that folder's id, once made collaborative), and `auto_approve_default INTEGER NOT NULL DEFAULT 0` (the project-wide default a new member's own `auto_approve` setting falls back to — see [12_COLLABORATION.md](12_COLLABORATION.md)).
- **`protocols`**: catalog of "official" protocols; today it only contains the PAISAGEO seed (`nomos-paisageo-v1`), inserted near `db/initialize.ts:210-224`, referencing the legacy static JSON at `assets/protocols/paisageo/paisageo_protocol.json`. This JSON is no longer the source of the real manifest (that's `modules/paisageo/manifest.ts`); it's a holdover from the pre-refactor format.
- **`custom_protocols`**: JSON schema for each user-created Personalized protocol (`schema` holds a serialized `CustomProtocolSchema`). It has a `theme TEXT NOT NULL` column (`db/initialize.ts:82`) — a free-text category/theme label (e.g. "Fauna", "Flora"), shown in the "My Projects" listing; unrelated to the light/dark visual theme (`contexts/theme-context.tsx`), which is a separate concept — note that the kernel's `ProtocolManifest` type also grew its own, optional `theme?: LocalizedString` field for the same purpose at the manifest level (see [02_GLOSSARY.md](02_GLOSSARY.md)). A `CustomSection` inside this schema can have a `moduleRef?: SharedModuleRef` (`types/database.ts`): when present, the whole section *is* a shared PAISAGEO scientific module (vegetation, geoecological constraints, or impacts, looked up in `modules/registry.ts`), and `fields` is left empty — the alternative to fields defined manually by the user in the builder. It also has a nullable `uuid TEXT` column (`db/initialize.ts:88`) — a stable id used to reconcile the same custom protocol across devices/collaborators, independent of the local auto-increment `id`.
- **`species`**: species observed at a specific point. The old single `common_name TEXT` column was replaced by `common_names TEXT` (a JSON array of strings), matching the same multiple-common-names pattern already used by `project_species_common_names`; it also gained `genus`, `family`, `created_at`, `last_updated` (`db/initialize.ts:195-212`). `point_id` is `TEXT NOT NULL` (foreign key into `points.id`, which is now a UUID string — see the note above). There's a `CHECK (scientific_name IS NOT NULL OR common_names IS NOT NULL)` constraint. `db/mappers/species.mapper.ts` deserializes `common_names` into `string[]`.
- **`project_species_catalog` + `project_species_common_names`**: the project's species catalog (sources: `gbif`, `specieslink`, `manual`, `catalog` — the last from JSON catalog import/export via `core/species-catalog/species-catalog-sharing.ts`), not tied to a specific point. `project_species_catalog` has a nullable `uuid TEXT` column (`db/initialize.ts:104`), same reconciliation purpose as `custom_protocols.uuid` — collaborators can add catalog entries independently and the `uuid` is what `reference-data-sync-service.ts` uses to avoid duplicating an entry that already exists on Drive.
- **`vegetation_classifications`**: custom per-project vegetation classifications (an alternative to automatic Kuchler classification). Queried via `db/queries/vegetation-classifications.ts` — already generic (not paisageo-specific), which is why it doesn't live inside `modules/paisageo/`. Also has a nullable `uuid TEXT` column (`db/initialize.ts:143`), same cross-device reconciliation purpose as above.
- **`project_members`** (`db/initialize.ts:222-232`, new table): one row per (project, collaborator email) pair — `role` (`'collaborator' | 'admin'`), `auto_approve` (`'herda_projeto' | 'true' | 'false'`, where `'herda_projeto'` means "fall back to `projects.auto_approve_default`"), and a `collector_code` (a short code the member picks, used to keep point numbering distinguishable across collaborators). This table only exists locally as a mirror — the durable membership record lives in the project's `manifest.json` on Drive; see [12_COLLABORATION.md](12_COLLABORATION.md). The source code's own inline comment still calls this "future use" — that's stale, the table is already wired into `project-drive-service.ts`/`project-sync-service.ts`.
