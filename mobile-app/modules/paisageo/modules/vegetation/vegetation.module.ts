import type { ModuleDescriptor } from "@/protocol-kernel/types";
import { vegetationSchema } from "./schema";
import { serializeVegetation, deserializeVegetation } from "./serde";

export const vegetationModule: ModuleDescriptor = {
  id: "vegetation",
  title: { pt: "Vegetação", en: "Vegetation", es: "Vegetación", fr: "Végétation" },
  schema: vegetationSchema,
  serialize: serializeVegetation,
  deserialize: deserializeVegetation,
};
