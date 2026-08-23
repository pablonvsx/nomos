import type { ModuleDescriptor } from "@/protocol-kernel/types";
import { geoecologicalConstraintsSchema } from "./schema";
import { serializeGeoecologicalConstraints, deserializeGeoecologicalConstraints } from "./serde";

export const geoecologicalConstraintsModule: ModuleDescriptor = {
  id: "geoecological_constraints",
  title: {
    pt: "Condicionantes Geoecológicos",
    en: "Geoecological Constraints",
    es: "Condicionantes Geoecológicos",
    fr: "Contraintes Géoécologiques",
  },
  schema: geoecologicalConstraintsSchema,
  serialize: serializeGeoecologicalConstraints,
  deserialize: deserializeGeoecologicalConstraints,
};
