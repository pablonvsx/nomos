import type { ExporterFactory } from "@/protocol-kernel/types";

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
