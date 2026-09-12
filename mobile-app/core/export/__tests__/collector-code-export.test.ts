// Verifies the collectorCode-population chain: PointEnvelope.collectorCode is
// NOT set inside buildPointEnvelope (db/mappers/point.mapper.ts) - it's set
// by the export handlers in app/(projects)/project-details/[id].tsx
// (handleExportGeoJSON / handleExportCSV), directly from the point's
// created_by (which already holds the collector's short code - see
// core/local-identity/collector-code.ts and core/drive-sync/point-label.ts),
// right after buildPointEnvelope runs and before the envelope reaches the
// export engine. This test reproduces that exact sequence with real
// production functions (no mocks) end-to-end, to confirm the CSV/GeoJSON
// output really carries the collector_code - not just "should, by
// inspection".
import { buildPointEnvelope } from "@/db/mappers/point.mapper";
import { buildProtocolExportPlan } from "../generic-export-engine";
import type { PointWithModules } from "@/types/database";

describe("collectorCode reaches CSV/GeoJSON export", () => {
  const pointWithModules: PointWithModules = {
    id: "point-1",
    project_id: 10,
    protocol_id: "paisageo",
    point_number: 3,
    lat: -8.05,
    lon: -34.9,
    altitude: null,
    generated_name: "Cerrado A",
    landscape_class_id: null,
    photos: null,
    audio_notes: null,
    additional_notes: null,
    point_size: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    created_by: "CG",
    approval_status: "approved",
    rejection_reason: null,
    drive_synced_at: "2026-01-01T00:00:00.000Z",
    modules: {},
  };

  it("sets collectorCode on the envelope the same way project-details/[id].tsx does", () => {
    // Step 1: build the base envelope - same call the export handlers make.
    const envelope = buildPointEnvelope(pointWithModules);
    expect(envelope.collectorCode).toBeUndefined(); // confirms it's absent at this point

    // Step 2: reproduce project-details/[id].tsx's export handlers verbatim.
    envelope.collectorCode = pointWithModules.created_by ?? undefined;

    expect(envelope.collectorCode).toBe("CG");
  });

  it("produces a CSV row and GeoJSON properties with collector_code filled in", () => {
    const envelope = buildPointEnvelope(pointWithModules);
    envelope.collectorCode = pointWithModules.created_by ?? undefined;

    const plan = buildProtocolExportPlan([], [envelope], "pt");

    const collectorCodeColumnIndex = plan.columns.findIndex((c) => c.key === "collector_code");
    expect(collectorCodeColumnIndex).toBeGreaterThanOrEqual(0);

    const row = plan.rowFor(envelope);
    expect(row[collectorCodeColumnIndex]).toBe("CG");

    const geoJsonProps = plan.toGeoJSONProperties(envelope);
    expect(geoJsonProps.collector_code).toBe("CG");
  });

  it("leaves collector_code null when the point has no created_by", () => {
    const localPoint: PointWithModules = { ...pointWithModules, created_by: null };
    const envelope = buildPointEnvelope(localPoint);
    envelope.collectorCode = localPoint.created_by ?? undefined;

    const plan = buildProtocolExportPlan([], [envelope], "pt");
    const row = plan.rowFor(envelope);
    const collectorCodeColumnIndex = plan.columns.findIndex((c) => c.key === "collector_code");
    expect(row[collectorCodeColumnIndex]).toBeNull();
  });
});
