import type { ModuleDescriptor } from "@/protocol-kernel/types";
import { impactsSchema } from "./schema";
import { serializeImpacts, deserializeImpacts } from "./serde";

export const impactsModule: ModuleDescriptor = {
  id: "impacts",
  title: {
    pt: "Impactos Ambientais",
    en: "Environmental Impacts",
    es: "Impactos Ambientales",
    fr: "Impacts Environnementaux",
  },
  schema: impactsSchema,
  serialize: serializeImpacts,
  deserialize: deserializeImpacts,
};
