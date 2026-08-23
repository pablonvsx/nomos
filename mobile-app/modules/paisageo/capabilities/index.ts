import type { CapabilityDeclaration } from "@/protocol-kernel/types";
import { kuchlerClassifyVegetation } from "./vegetation-classifier";
import { landscapeGenerateName } from "./landscape-naming";

export { kuchlerClassifyVegetation } from "./vegetation-classifier";
export { landscapeGenerateName } from "./landscape-naming";
export type { KuchlerClassifyInput } from "./vegetation-classifier";
export type { LandscapeGenerateNameInput } from "./landscape-naming";

export const paisageoCapabilities: CapabilityDeclaration[] = [
  kuchlerClassifyVegetation as CapabilityDeclaration,
  landscapeGenerateName as CapabilityDeclaration,
];
