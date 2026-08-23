import type { ProtocolManifest } from "@/protocol-kernel/types";
import { vegetationModule } from "./modules/vegetation/vegetation.module";
import { geoecologicalConstraintsModule } from "./modules/geoecological-constraints/geoecological-constraints.module";
import { impactsModule } from "./modules/impacts/impacts.module";
import { paisageoCapabilities } from "./capabilities";
import { createPaisageoExporter } from "./exporter";

export const paisageoManifest: ProtocolManifest = {
  id: "paisageo",
  name: { pt: "Paisageo", en: "Paisageo", es: "Paisageo", fr: "Paisageo" },
  // Stored as a plain integer ("1", "2", ...); the UI renders it as "v1.0",
  // "v2.0", etc. Bump this only when the Paisageo protocol itself changes.
  version: "1",
  authors: ["PAISAGEO/UFPE"],
  description: {
    pt: "Protocolo original do Nomos, elaborado para coleta de campo no contexto de mapeamento de paisagem.",
    en: "Original Nomos protocol, designed for field data collection in the context of landscape mapping.",
    es: "Protocolo original de Nomos, diseñado para la recolección de datos de campo en el contexto del mapeo de paisajes.",
    fr: "Protocole original de Nomos, conçu pour la collecte de données de terrain dans le cadre de la cartographie des paysages.",
  },
  theme: {
    pt: "Cartografia de Paisagem",
    en: "Landscape Mapping",
    es: "Cartografía de Paisaje",
    fr: "Cartographie du Paysage",
  },
  kind: "scientific",
  modules: [vegetationModule, geoecologicalConstraintsModule, impactsModule],
  provides: paisageoCapabilities,
  requires: [],
  exporter: createPaisageoExporter,
};
