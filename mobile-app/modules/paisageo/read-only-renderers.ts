import type { ModuleReadOnlyRendererBinding } from "@/modules/generic/module-read-only-renderer-registry";
import { VegetationModuleReadOnlyRenderer } from "./modules/vegetation/VegetationModuleReadOnlyRenderer";
import { GeoecologicalConstraintsModuleReadOnlyRenderer } from "./modules/geoecological-constraints/GeoecologicalConstraintsModuleReadOnlyRenderer";
import { ImpactsModuleReadOnlyRenderer } from "./modules/impacts/ImpactsModuleReadOnlyRenderer";

export const paisageoReadOnlyRendererBindings: ModuleReadOnlyRendererBinding[] = [
  { moduleId: "vegetation", Renderer: VegetationModuleReadOnlyRenderer },
  { moduleId: "geoecological_constraints", Renderer: GeoecologicalConstraintsModuleReadOnlyRenderer },
  { moduleId: "impacts", Renderer: ImpactsModuleReadOnlyRenderer },
];
