import type { CapabilityDeclaration } from "@/protocol-kernel/types";
import {
  generateLandscapeName,
  type LandscapeDataInput,
} from "@/modules/paisageo/services/landscape-naming";

export interface LandscapeGenerateNameInput {
  data: LandscapeDataInput;
  lang?: string;
}

export const landscapeGenerateName: CapabilityDeclaration<
  LandscapeGenerateNameInput,
  string
> = {
  id: "landscape.generateName",
  version: "1.0.0",
  contract: { id: "landscape.generateName" },
  implementation: (input) => generateLandscapeName(input.data, input.lang),
};
