// mobile-app/constants/native-protocols-catalog.ts
//
// Descriptive (non-functional) per-module text for native protocols, shown in
// the module picker of the protocol builder (app/(projects)/protocol/builder.tsx).
// Lives outside protocol-kernel/ and modules/<id>/: it's presentation text for
// the user, not part of the protocol's definition/implementation. To add a
// new native protocol, just add an entry here (key = same `id` as the
// manifest), without touching modules/<id>/.
//
// The former per-protocol "workflow" prose (shown by the removed native
// protocols screen) is preserved in docs/protocolos-nativos-app-legado.md.
//
// Lives in constants/ (not app/) because any file inside app/ is treated
// by Expo Router as a route - a module without a component default export
// there triggers the "missing the required default export" warning.
//
// Paisageo content below is a first draft — feel free to review/adjust.

import type { LocalizedString } from "@/protocol-kernel/types";

export interface NativeProtocolCatalogEntry {
  /** Short per-module description, matched by the ModuleDescriptor's `id`. */
  modules: { id: string; description: LocalizedString }[];
}

export const NATIVE_PROTOCOLS_CATALOG: Record<string, NativeProtocolCatalogEntry> = {
  paisageo: {
    modules: [
      {
        id: "vegetation",
        description: {
          pt: "Estado de conservação e estrutura da vegetação no ponto. A estrutura é classificada automaticamente pela fórmula fisionômica de Küchler (1988) a partir da matriz de altura, forma de vida e cobertura preenchida em campo, classificação padrão do protocolo. Alternativamente, o projeto pode adotar uma classificação de vegetação personalizada, com classes definidas pelo próprio usuário (gerenciável na tela de detalhes do projeto), usada no lugar da classificação de Küchler durante o preenchimento dos pontos.",
          en: "Vegetation conservation status and structure at the point. Structure is automatically classified using the Küchler (1988) physiognomic formula from the height/life-form/cover matrix filled in the field, the protocol's standard classification. Alternatively, the project can adopt a custom vegetation classification, with classes defined by the user (manageable from the project details screen), used in place of the Küchler classification when filling in points.",
          es: "Estado de conservación y estructura de la vegetación en el punto. La estructura se clasifica automáticamente mediante la fórmula fisionómica de Küchler (1988) a partir de la matriz de altura, forma de vida y cobertura completada en campo, clasificación estándar del protocolo. Alternativamente, el proyecto puede adoptar una clasificación de vegetación personalizada, con clases definidas por el propio usuario (gestionable en la pantalla de detalles del proyecto), utilizada en lugar de la clasificación de Küchler durante el llenado de los puntos.",
          fr: "État de conservation et structure de la végétation au point. La structure est classée automatiquement selon la formule physionomique de Küchler (1988) à partir de la matrice hauteur/forme de vie/couverture remplie sur le terrain, classification standard du protocole. Le projet peut également adopter une classification de végétation personnalisée, avec des classes définies par l'utilisateur (gérable depuis l'écran de détails du projet), utilisée à la place de la classification de Küchler lors du remplissage des points.",
        },
      },
      {
        id: "geoecological_constraints",
        description: {
          pt: "Condicionantes geoecológicos do ponto amostral: feições do relevo e da superfície do terreno (forma, declividade e demais atributos geomorfológicos), cobertura da superfície e perfil do solo (textura, cor, presença de matéria orgânica e outros atributos observados em campo).",
          en: "Geoecological constraints at the sampling point: landform and terrain surface features (shape, slope, and other geomorphological attributes), surface cover, and soil profile (texture, color, presence of organic matter, and other field-observed attributes).",
          es: "Condicionantes geoecológicos del punto de muestreo: rasgos del relieve y de la superficie del terreno (forma, pendiente y demás atributos geomorfológicos), cobertura de la superficie y perfil del suelo (textura, color, presencia de materia orgánica y otros atributos observados en campo).",
          fr: "Contraintes géoécologiques au point d'échantillonnage : caractéristiques du relief et de la surface du terrain (forme, pente et autres attributs géomorphologiques), couverture de la surface et profil du sol (texture, couleur, présence de matière organique et autres attributs observés sur le terrain).",
        },
      },
      {
        id: "impacts",
        description: {
          pt: "Registro de impactos ambientais visíveis no entorno do ponto, como erosão, presença de resíduos ou alterações antrópicas na paisagem.",
          en: "Record of environmental impacts visible around the point, such as erosion, waste presence, or human-driven landscape changes.",
          es: "Registro de impactos ambientales visibles en el entorno del punto, como erosión, presencia de residuos o alteraciones antrópicas en el paisaje.",
          fr: "Enregistrement des impacts environnementaux visibles autour du point, tels que l'érosion, la présence de déchets ou les altérations anthropiques du paysage.",
        },
      },
    ],
  },
};
