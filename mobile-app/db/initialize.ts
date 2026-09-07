// src/db/initialize.ts
import * as SQLite from "expo-sqlite";

// Open database - expo-sqlite handles persistent storage automatically
const db = SQLite.openDatabaseSync("nomos.db");

// Development trigger: set to true to wipe and recreate the full schema on app start.
const RESET_DATABASE_ON_INIT = false; // Set to true for development/testing purposes only

async function resetDatabase() {
  console.warn("⚠️ RESET_DATABASE_ON_INIT is enabled. Dropping all tables...");

  // Drop child tables first to avoid FK dependency issues.
  await db.execAsync("DROP TABLE IF EXISTS project_members");
  await db.execAsync("DROP TABLE IF EXISTS project_species_common_names");
  await db.execAsync("DROP TABLE IF EXISTS project_species_catalog");
  await db.execAsync("DROP TABLE IF EXISTS species");
  await db.execAsync("DROP TABLE IF EXISTS point_modules");
  await db.execAsync("DROP TABLE IF EXISTS points");
  await db.execAsync("DROP TABLE IF EXISTS vegetation_classifications");
  await db.execAsync("DROP TABLE IF EXISTS projects");
  await db.execAsync("DROP TABLE IF EXISTS custom_protocols");
  await db.execAsync("DROP TABLE IF EXISTS protocols");

  console.warn("🧹 Database tables dropped successfully.");
}

export async function initDatabase() {
  try {
    console.log("🔧 Initializing database...");

    // Performance and integrity settings
    await db.execAsync("PRAGMA journal_mode = WAL");
    await db.execAsync("PRAGMA foreign_keys = ON");

    if (RESET_DATABASE_ON_INIT) {
      await resetDatabase();
    }

    // 1. CREATING TABLES
    // Official Protocol Table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS protocols (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        authors TEXT NOT NULL,       -- JSON Array
        description TEXT NOT NULL,
        year INTEGER,                -- Year of the version
        version TEXT NOT NULL,
        json_rules_path TEXT NOT NULL,
        is_active INTEGER DEFAULT 1
      );
    `);

    // Projects Table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        protocol_id TEXT NOT NULL,   -- References either protocols.id or custom_protocols.id
        protocol_source TEXT DEFAULT 'official', -- 'official' or 'custom'
        created_at TEXT NOT NULL,
        last_updated TEXT NOT NULL,
        geojson_layer TEXT,
        geojson_field_route TEXT,
        is_classified INTEGER DEFAULT 0,
        last_classified_at TEXT,
        vegetation_classification_type TEXT DEFAULT 'standard', -- 'standard' or 'custom'
        active_custom_vegetation_classification_id INTEGER,
        is_collaborative INTEGER NOT NULL DEFAULT 0,
        drive_folder_id TEXT,
        auto_approve_default INTEGER NOT NULL DEFAULT 0
      );
    `);

    // Custom Protocols Table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS custom_protocols (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        theme TEXT NOT NULL,
        description TEXT,
        collection_instructions TEXT,
        schema TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Project Species Catalog Table (from GBIF or manual entry)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS project_species_catalog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        scientific_name TEXT NOT NULL,
        family TEXT,
        genus TEXT,
        gbif_id TEXT,
        source TEXT DEFAULT 'manual',
        created_at TEXT NOT NULL,
        last_updated TEXT NOT NULL,

        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        UNIQUE(project_id, gbif_id)
      );
    `);

    await db.execAsync(
      "CREATE INDEX IF NOT EXISTS idx_project_species_catalog_project_id ON project_species_catalog(project_id)",
    );

    // Project Species Common Names Table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS project_species_common_names (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        species_id INTEGER NOT NULL,
        common_name TEXT NOT NULL,
        language TEXT DEFAULT 'pt',
        source TEXT DEFAULT 'manual',
        created_at TEXT NOT NULL,

        FOREIGN KEY (species_id) REFERENCES project_species_catalog(id) ON DELETE CASCADE,
        UNIQUE(species_id, common_name, language)
      );
    `);

    await db.execAsync(
      "CREATE INDEX IF NOT EXISTS idx_project_species_common_names_species_id ON project_species_common_names(species_id)",
    );

    // Vegetation Classifications Table
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS vegetation_classifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        classes TEXT NOT NULL,        -- JSON array of VegetationClass objects
        created_at TEXT NOT NULL,
        last_updated TEXT NOT NULL,

        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
    `);

    // Points Table (schema-driven, replaces survey_points and custom_survey_points)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS points (
        id TEXT PRIMARY KEY NOT NULL,
        project_id INTEGER NOT NULL,
        protocol_id TEXT NOT NULL,            -- "paisageo" | "custom"
        point_number INTEGER NOT NULL,
        lat REAL NOT NULL,
        lon REAL NOT NULL,
        altitude REAL,
        generated_name TEXT,
        landscape_class_id INTEGER,
        photos TEXT,                          -- JSON array (provisional until Phase 7)
        audio_notes TEXT,                     -- JSON array (provisional)
        additional_notes TEXT,                -- JSON array (provisional)
        point_size REAL,                      -- plot size (provisional)
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        created_by TEXT,                      -- email or device id; not populated yet
        approval_status TEXT NOT NULL DEFAULT 'local'
          CHECK (approval_status IN ('local', 'pending', 'approved', 'rejected')),

        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
    `);

    await db.execAsync(
      "CREATE INDEX IF NOT EXISTS idx_points_project_id ON points(project_id)",
    );

    // Point Modules Table (one record per module per point)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS point_modules (
        point_id TEXT NOT NULL,
        module_id TEXT NOT NULL,              -- "vegetation" | "geoecological_constraints" | "impacts" | custom id
        schema_version TEXT NOT NULL,         -- manifest version at the time of writing
        data_json TEXT NOT NULL,              -- ModuleDescriptor's serialize()
        PRIMARY KEY (point_id, module_id),
        FOREIGN KEY (point_id) REFERENCES points(id) ON DELETE CASCADE
      );
    `);

    // Species Table (linked to points, no longer to survey_points)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS species (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        point_id TEXT NOT NULL,
        scientific_name TEXT,
        common_names TEXT, -- JSON array of strings, or NULL (multiple common names)
        genus TEXT,
        family TEXT,
        abundance INTEGER,
        created_at TEXT NOT NULL,
        last_updated TEXT NOT NULL,

        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (point_id) REFERENCES points(id) ON DELETE CASCADE,

        CHECK (scientific_name IS NOT NULL OR common_names IS NOT NULL)
      );
    `);

    await db.execAsync(
      "CREATE INDEX IF NOT EXISTS idx_species_project_id ON species(project_id)",
    );
    await db.execAsync(
      "CREATE INDEX IF NOT EXISTS idx_species_point_id ON species(point_id)",
    );

    // Project Members Table (Drive-based collaboration, future use)
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS project_members (
        project_id INTEGER NOT NULL,
        member_email TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'collaborator',
        auto_approve TEXT NOT NULL DEFAULT 'herda_projeto',
        PRIMARY KEY (project_id, member_email),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
    `);

    // 2. Paisageo Official Protocol
    const protocolId = "nomos-paisageo-v1";
    const checkProtocol = await db.getFirstAsync<{ id: string }>(
      "SELECT id FROM protocols WHERE id = ?",
      [protocolId],
    );

    if (!checkProtocol) {
      await db.runAsync(
        `
            INSERT INTO protocols (id, title, authors, description, year, version, json_rules_path, is_active) VALUES
            (?, 'Paisageo: Cartografia de Paisagens', '["Neves, P. G. M.", "Cavalcanti, L. C. S."]',
            'Protocolo Paisageo de cartografia de paisagens do Nomos para inventários ambientais.',
            2026, '1.0', 'assets/protocols/paisageo/paisageo_protocol.json', 1);
        `,
        [protocolId],
      );
      console.log("✓ Default protocol created");
    }

    console.log("✅ Database initialized successfully!");
  } catch (error) {
    console.error("❌ Database initialization error:", error);
    throw error;
  }
}

export { db };
