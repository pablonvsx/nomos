import { buildColumns } from "../schema/dynamic-columns";
import type {
  ModuleDescriptor,
  ColumnDef,
  LanguageCode,
  PointEnvelope,
} from "@/protocol-kernel/types";

export interface ProtocolExportPlan {
  columns: ColumnDef[];
  rowFor: (point: PointEnvelope) => Array<string | number | null>;
  toGeoJSONProperties: (point: PointEnvelope) => Record<string, string | number | null>;
}

// Point-level column whose value doesn't come from a module, but directly
// from the PointEnvelope. Each protocol declares its own via
// extraPointColumns (e.g. Paisageo asks for
// generated_name/landscape_class_id/point_size) - the engine itself doesn't
// know protocol names, it only knows how to build from what it receives.
export interface PointColumnDef {
  key: string;
  label: string;
  getValue: (point: PointEnvelope) => string | number | null;
}

// Only point-level fields universal to any protocol.
const BASE_POINT_COLUMNS: PointColumnDef[] = [
  { key: "id",           label: "id",           getValue: (p) => p.id },
  { key: "point_number", label: "point_number", getValue: (p) => p.pointNumber },
  { key: "created_at",   label: "created_at",   getValue: (p) => p.createdAt ?? null },
  { key: "latitude",     label: "latitude",     getValue: (p) => p.lat },
  { key: "longitude",    label: "longitude",    getValue: (p) => p.lon },
  { key: "altitude",     label: "altitude",     getValue: (p) => p.altitude ?? null },
];

/**
 * Builds the export plan for a protocol, composing multiple modules into
 * one row per point. Uses buildColumns internally for each module.
 *
 * Point-level fields come first, followed by each module's fields in
 * moduleDescriptors order. If two different modules have identical
 * field.ids, the second module's are prefixed with its module.id.
 */
export function buildProtocolExportPlan(
  moduleDescriptors: ModuleDescriptor[],
  points: PointEnvelope[],
  language: LanguageCode,
  extraPointColumns: PointColumnDef[] = [],
): ProtocolExportPlan {
  const pointColumns: PointColumnDef[] = [...BASE_POINT_COLUMNS, ...extraPointColumns];

  // Detect key collisions between different modules
  const seenKeys = new Set<string>();

  const perModule = moduleDescriptors.map((descriptor) => {
    const moduleData = points.map(
      (p) => (p.modules[descriptor.id] as Record<string, unknown>) ?? {},
    );
    const plan = buildColumns(descriptor.schema, moduleData, language);

    // Check for collisions and prefix when needed
    const remappedColumns: ColumnDef[] = plan.columns.map((col) => {
      if (seenKeys.has(col.key)) {
        return { key: `${descriptor.id}_${col.key}`, label: col.label };
      }
      seenKeys.add(col.key);
      return col;
    });

    // Mapa de chave original → chave final (para rowFor)
    const keyRemap = new Map<string, string>();
    plan.columns.forEach((col, i) => {
      keyRemap.set(col.key, remappedColumns[i].key);
    });

    return { descriptor, plan, remappedColumns, keyRemap };
  });

  const allColumns: ColumnDef[] = [
    ...pointColumns.map(({ key, label }) => ({ key, label })),
    ...perModule.flatMap((m) => m.remappedColumns),
  ];

  function sanitizeCell(val: string | number | null): string | number | null {
    if (typeof val !== "string") return val;
    return val.replace(/\r\n|\n|\r/g, " | ");
  }

  function rowFor(point: PointEnvelope): Array<string | number | null> {
    const moduleData = (descriptorId: string) =>
      (point.modules[descriptorId] as Record<string, unknown>) ?? {};

    const moduleValues = perModule.flatMap((m) =>
      m.plan.rowFor(moduleData(m.descriptor.id)),
    );

    const pointValues = pointColumns.map((c) => c.getValue(point));
    return [...pointValues, ...moduleValues].map(sanitizeCell);
  }

  function toGeoJSONProperties(
    point: PointEnvelope,
  ): Record<string, string | number | null> {
    const values = rowFor(point);
    const props: Record<string, string | number | null> = {};
    allColumns.forEach((col, i) => {
      props[col.key] = values[i] ?? null;
    });
    return props;
  }

  return { columns: allColumns, rowFor, toGeoJSONProperties };
}
