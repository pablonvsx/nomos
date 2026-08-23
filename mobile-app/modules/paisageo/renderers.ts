import type { ModuleRendererBinding } from "@/protocol-kernel/types";
import { VegetationModuleRenderer } from "./modules/vegetation/VegetationModuleRenderer";
import { GeoecologicalConstraintsModuleRenderer } from "./modules/geoecological-constraints/GeoecologicalConstraintsModuleRenderer";
import { ImpactsModuleRenderer } from "./modules/impacts/ImpactsModuleRenderer";

export const paisageoRendererBindings: ModuleRendererBinding[] = [
  { moduleId: "vegetation", Renderer: VegetationModuleRenderer },
  { moduleId: "geoecological_constraints", Renderer: GeoecologicalConstraintsModuleRenderer },
  { moduleId: "impacts", Renderer: ImpactsModuleRenderer },
];
