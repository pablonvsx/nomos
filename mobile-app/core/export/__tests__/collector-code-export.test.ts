// Verifies the exact collectorCode-population chain requested in the
// collaboration audit: PointEnvelope.collectorCode is NOT set inside
// buildPointEnvelope (db/mappers/point.mapper.ts) - it's set by the export
// handlers in app/(projects)/project-details/[id].tsx (handleExportGeoJSON /
// handleExportCSV, using toMemberLiteList from core/drive-sync/point-label.ts
// against the point's created_by), right after buildPointEnvelope runs and
// before the envelope reaches the export engine. This test reproduces that
// exact sequence with real production functions (no mocks) end-to-end, to
// confirm the CSV/GeoJSON output for a collaborative project really carries
// the collector_code - not just "should, by inspection".
import { buildPointEnvelope } from "@/db/mappers/point.mapper";
import { toMemberLiteList } from "@/core/drive-sync/point-label";
import { buildProtocolExportPlan } from "../generic-export-engine";
import type { PointWithModules, ProjectMember } from "@/types/database";

describe("collectorCode reaches CSV/GeoJSON export for a collaborative project", () => {
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
    created_by: "colega@example.com",
    approval_status: "approved",
    rejection_reason: null,
    drive_synced_at: "2026-01-01T00:00:00.000Z",
    modules: {},
  };

  const projectMembers: ProjectMember[] = [
    {
      project_id: 10,
      member_email: "colega@example.com",
      role: "collaborator",
      auto_approve: "herda_projeto",
      collector_code: "CG",
    },
  ];

  it("sets collectorCode on the envelope the same way project-details/[id].tsx does", () => {
    // Step 1: build the base envelope - same call the export handlers make.
    const envelope = buildPointEnvelope(pointWithModules);
    expect(envelope.collectorCode).toBeUndefined(); // confirms it's absent at this point

    // Step 2: reproduce project-details/[id].tsx:507-512 verbatim.
    const membersLite = toMemberLiteList(projectMembers);
    envelope.collectorCode = membersLite.find(
      (m) => m.email === pointWithModules.created_by,
    )?.collector_code;

    expect(envelope.collectorCode).toBe("CG");
  });

  it("produces a CSV row and GeoJSON properties with collector_code filled in", () => {
    const envelope = buildPointEnvelope(pointWithModules);
    const membersLite = toMemberLiteList(projectMembers);
    envelope.collectorCode = membersLite.find(
      (m) => m.email === pointWithModules.created_by,
    )?.collector_code;

    const plan = buildProtocolExportPlan([], [envelope], "pt");

    const collectorCodeColumnIndex = plan.columns.findIndex((c) => c.key === "collector_code");
    expect(collectorCodeColumnIndex).toBeGreaterThanOrEqual(0);

    const row = plan.rowFor(envelope);
    expect(row[collectorCodeColumnIndex]).toBe("CG");

    const geoJsonProps = plan.toGeoJSONProperties(envelope);
    expect(geoJsonProps.collector_code).toBe("CG");
  });

  it("leaves collector_code null when created_by has no matching project member", () => {
    const orphanPoint: PointWithModules = { ...pointWithModules, created_by: "ninguem@example.com" };
    const envelope = buildPointEnvelope(orphanPoint);
    const membersLite = toMemberLiteList(projectMembers);
    envelope.collectorCode = membersLite.find(
      (m) => m.email === orphanPoint.created_by,
    )?.collector_code;

    const plan = buildProtocolExportPlan([], [envelope], "pt");
    const row = plan.rowFor(envelope);
    const collectorCodeColumnIndex = plan.columns.findIndex((c) => c.key === "collector_code");
    expect(row[collectorCodeColumnIndex]).toBeNull();
  });
});
