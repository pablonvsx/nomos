import type { CapabilityDeclaration } from "@/protocol-kernel/types";
import {
  classifyVegetation,
  type ClassificationResult,
  type ContextFlag,
} from "@/modules/paisageo/services/vegetation_classifier";

export interface KuchlerClassifyInput {
  rawFormula: string;
  lang?: "pt" | "en" | "es" | "fr";
  contextFlags?: ContextFlag[];
}

export const kuchlerClassifyVegetation: CapabilityDeclaration<
  KuchlerClassifyInput,
  ClassificationResult
> = {
  id: "kuchler.classifyVegetation",
  version: "1.0.0",
  contract: { id: "kuchler.classifyVegetation" },
  implementation: (input) =>
    classifyVegetation(input.rawFormula, input.lang, input.contextFlags),
};
