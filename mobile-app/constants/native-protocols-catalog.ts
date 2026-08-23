// mobile-app/constants/native-protocols-catalog.ts
//
// Descriptive (non-functional) content shown in the native protocol
// showcase (app/(projects)/protocol/native-catalog.tsx). Lives outside
// protocol-kernel/ and modules/<id>/: it's presentation text for the
// user, not part of the protocol's definition/implementation. To add a
// new native protocol, just add an entry here (key = same `id` as the
// manifest), without touching modules/<id>/.
//
// Lives in constants/ (not app/) because any file inside app/ is treated
// by Expo Router as a route - a module without a component default export
// there triggers the "missing the required default export" warning.
//
// Paisageo content below is a first draft — feel free to review/adjust.

import type { LocalizedString } from "@/protocol-kernel/types";

export interface NativeProtocolCatalogEntry {
  /** Explains, in prose, the protocol's fill-in workflow. */
  workflow: LocalizedString;
  /** Short per-module description, matched by the ModuleDescriptor's `id`. */
  modules: { id: string; description: LocalizedString }[];
  /**
   * Link (Google Drive) to the structured practical guide document, if one
   * exists for this protocol. The "Acessar Guia Prático" button on
   * native-catalog.tsx only renders when this is set.
   */
  structuredTutorialUrl?: string;
}

export const NATIVE_PROTOCOLS_CATALOG: Record<string, NativeProtocolCatalogEntry> = {
  paisageo: {
    structuredTutorialUrl:
      "https://docs.google.com/document/d/14M19dZIUNGjFN2J7mU_xN3LT13nbuIot/edit?usp=sharing&ouid=108514355750288846507&rtpof=true&sd=true",
    workflow: {
      pt: "A coleta é organizada por pontos amostrais em campo. As coordenadas de cada ponto são obtidas no mapa e, em seguida, o formulário é preenchido na ordem descrita a seguir.\n\nPrimeiro é feita a verificação de homogeneidade da área na escala de coleta e o registro do tamanho da parcela observada. Depois é avaliado o estado de conservação da vegetação (nativa, em regeneração ou substituída) e sua estrutura, classificada pela matriz fisionômica de Küchler (1988) — ou por uma classificação de vegetação personalizada, criada e gerenciada por projeto —, complementada pelo levantamento florístico das espécies identificadas. Em seguida são registrados a cobertura da superfície e os atributos geomorfológicos do relevo (exposição, declividade, forma e posição topográfica) e do solo, seguidos dos impactos ambientais observados no entorno. Com base na vegetação, no ambiente geomorfológico e nos impactos registrados, o aplicativo gera automaticamente um nome sintético para a paisagem do ponto (por exemplo, \"[vegetação] sobre [ambiente], influenciada por [impactos]\"), exibido no detalhe do ponto como \"Nome da Paisagem\". Por fim, são anexadas fotos do ponto e notas complementares em texto ou áudio.\n\nOs nomes de paisagem gerados para cada ponto também alimentam a classificação do projeto: ao classificar a coleta, pontos com o mesmo nome de paisagem são agrupados automaticamente no mesmo tipo de paisagem, na ordem de campo.",
      en: "Data collection is organized by field sampling points. Each point's coordinates are captured on the map, and the form is then filled in the order described below.\n\nFirst, the homogeneity of the area is checked at the collection scale, and the size of the observed plot is recorded. Next, the vegetation's conservation status (native, regenerating, or substituted) is assessed, along with its structure, classified using the Küchler (1988) physiognomic formula — or a custom vegetation classification created and managed per project — complemented by a floristic survey of the identified species. Surface cover and the terrain's geomorphological attributes (exposure, slope, shape, and topographic position) and soil profile are recorded next, followed by the environmental impacts observed nearby. Based on the vegetation, the geomorphological environment, and the recorded impacts, the app automatically generates a synthetic landscape name for the point (e.g., \"[vegetation] over [environment], influenced by [impacts]\"), shown in the point's details as \"Landscape Name\". Finally, photos of the point and additional notes (text or audio) are attached.\n\nThe landscape names generated for each point also feed the project's classification: when classifying the collection, points sharing the same landscape name are automatically grouped into the same landscape type, in field order.",
      es: "La recolección se organiza por puntos de muestreo en campo. Las coordenadas de cada punto se obtienen en el mapa y luego se completa el formulario en el orden descrito a continuación.\n\nPrimero se verifica la homogeneidad del área en la escala de recolección y se registra el tamaño de la parcela observada. Después se evalúa el estado de conservación de la vegetación (nativa, en regeneración o sustituida) y su estructura, clasificada mediante la fórmula fisionómica de Küchler (1988) — o mediante una clasificación de vegetación personalizada, creada y gestionada por proyecto —, complementada por el levantamiento florístico de las especies identificadas. Luego se registran la cobertura de la superficie y los atributos geomorfológicos del relieve (exposición, pendiente, forma y posición topográfica) y del suelo, seguidos de los impactos ambientales observados en el entorno. Con base en la vegetación, el ambiente geomorfológico y los impactos registrados, la aplicación genera automáticamente un nombre sintético para el paisaje del punto (por ejemplo, \"[vegetación] sobre [ambiente], influenciada por [impactos]\"), mostrado en el detalle del punto como \"Nombre del Paisaje\". Por último, se adjuntan fotos del punto y notas complementarias en texto o audio.\n\nLos nombres de paisaje generados para cada punto también alimentan la clasificación del proyecto: al clasificar la recolección, los puntos con el mismo nombre de paisaje se agrupan automáticamente en el mismo tipo de paisaje, en el orden de campo.",
      fr: "La collecte est organisée par points d'échantillonnage sur le terrain. Les coordonnées de chaque point sont obtenues sur la carte, puis le formulaire est rempli dans l'ordre décrit ci-dessous.\n\nLa vérification de l'homogénéité de la zone à l'échelle de collecte et l'enregistrement de la taille de la parcelle observée sont effectués en premier. L'état de conservation de la végétation (native, en régénération ou substituée) et sa structure sont ensuite évalués, classés selon la formule physionomique de Küchler (1988) — ou selon une classification de végétation personnalisée, créée et gérée par projet —, complétés par le relevé floristique des espèces identifiées. La couverture de la surface ainsi que les attributs géomorphologiques du relief (exposition, pente, forme et position topographique) et du sol sont ensuite enregistrés, suivis des impacts environnementaux observés aux alentours. À partir de la végétation, de l'environnement géomorphologique et des impacts enregistrés, l'application génère automatiquement un nom synthétique pour le paysage du point (par exemple, « [végétation] sur [environnement], influencée par [impacts] »), affiché dans le détail du point sous le nom « Nom du Paysage ». Enfin, des photos du point et des notes complémentaires (texte ou audio) sont ajoutées.\n\nLes noms de paysage générés pour chaque point alimentent également la classification du projet : lors de la classification de la collecte, les points partageant le même nom de paysage sont automatiquement regroupés dans le même type de paysage, selon l'ordre de terrain.",
    },
    modules: [
      {
        id: "vegetation",
        description: {
          pt: "Estado de conservação e estrutura da vegetação no ponto. A estrutura é classificada automaticamente pela fórmula fisionômica de Küchler (1988) a partir da matriz de altura, forma de vida e cobertura preenchida em campo — classificação padrão do protocolo. Alternativamente, o projeto pode adotar uma classificação de vegetação personalizada, com classes definidas pelo próprio usuário (gerenciável na tela de detalhes do projeto), usada no lugar da classificação de Küchler durante o preenchimento dos pontos.",
          en: "Vegetation conservation status and structure at the point. Structure is automatically classified using the Küchler (1988) physiognomic formula from the height/life-form/cover matrix filled in the field — the protocol's standard classification. Alternatively, the project can adopt a custom vegetation classification, with classes defined by the user (manageable from the project details screen), used in place of the Küchler classification when filling in points.",
          es: "Estado de conservación y estructura de la vegetación en el punto. La estructura se clasifica automáticamente mediante la fórmula fisionómica de Küchler (1988) a partir de la matriz de altura, forma de vida y cobertura completada en campo — clasificación estándar del protocolo. Alternativamente, el proyecto puede adoptar una clasificación de vegetación personalizada, con clases definidas por el propio usuario (gestionable en la pantalla de detalles del proyecto), utilizada en lugar de la clasificación de Küchler durante el llenado de los puntos.",
          fr: "État de conservation et structure de la végétation au point. La structure est classée automatiquement selon la formule physionomique de Küchler (1988) à partir de la matrice hauteur/forme de vie/couverture remplie sur le terrain — classification standard du protocole. Le projet peut également adopter une classification de végétation personnalisée, avec des classes définies par l'utilisateur (gérable depuis l'écran de détails du projet), utilisée à la place de la classification de Küchler lors du remplissage des points.",
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
