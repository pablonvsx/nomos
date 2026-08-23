// mobile-app/constants/protocol-tutorials.ts
//
// Descriptive (non-functional) content shown in the tutorials screen
// (app/(projects)/protocol/tutorials.tsx). Lives outside protocol-kernel/
// and modules/<id>/ for the same reason native-protocols-catalog.ts does:
// it's presentation text for the user, not part of a protocol's
// definition/implementation.
//
// Content is translated into pt/en/es/fr. Terminology (screen names,
// button labels, field type names) is kept consistent with the rest of
// the app's locales/*.json - see e.g. "protocol.fieldTypes" for the
// custom field type names reused in the "custom" tutorial's field-type
// list below.
//
// Keyed by protocol manifest id: "paisageo" for the native protocol,
// "custom" for the single generic custom-protocol manifest (see
// modules/custom/manifest.ts) - the custom entry documents the builder
// mechanism itself, not any specific user-created protocol.

import type { LocalizedString } from "@/protocol-kernel/types";

export interface TutorialStep {
  icon: string;
  title: LocalizedString;
  description: LocalizedString;
}

export interface TutorialSection {
  icon: string;
  title: LocalizedString;
  intro?: LocalizedString;
  steps: TutorialStep[];
}

export interface ProtocolTutorialContent {
  sections: TutorialSection[];
}

export const PROTOCOL_TUTORIALS: Record<string, ProtocolTutorialContent> = {
  paisageo: {
    sections: [
      {
        icon: "map-marker-radius-outline",
        title: { pt: "Pré-Campo", en: "Pre-Field", es: "Pre-Campo", fr: "Avant le Terrain" },
        intro: {
          pt: "Antes de ir a campo, prepare os três insumos abaixo no Nomos. Eles ficam disponíveis offline durante a coleta.",
          en: "Before heading to the field, prepare the three inputs below in Nomos. They stay available offline during data collection.",
          es: "Antes de ir a campo, prepare los tres insumos siguientes en Nomos. Quedan disponibles sin conexión durante la recolección.",
          fr: "Avant d'aller sur le terrain, préparez les trois éléments ci-dessous dans Nomos. Ils restent disponibles hors ligne pendant la collecte.",
        },
        steps: [
          {
            icon: "map-outline",
            title: {
              pt: "Prepare o mapa da área",
              en: "Prepare the area map",
              es: "Prepare el mapa del área",
              fr: "Préparez la carte de la zone",
            },
            description: {
              pt: "Em Detalhes do Projeto → Visualização → \"Mapa\", importe um arquivo GeoJSON com o mapeamento prévio da área de estudo (por exemplo, um shapefile convertido com os limites da área). Ele fica sobreposto ao mapa durante a coleta.",
              en: "In Project Details → Visualization → \"Map\", import a GeoJSON file with the prior mapping of the study area (for example, a converted shapefile with the area boundaries). It's overlaid on the map during data collection.",
              es: "En Detalles del Proyecto → Visualización del Proyecto → \"Mapa\", importe un archivo GeoJSON con el mapeo previo del área de estudio (por ejemplo, un shapefile convertido con los límites del área). Queda superpuesto al mapa durante la recolección.",
              fr: "Dans Détails du Projet → Visualisation du Projet → « Carte », importez un fichier GeoJSON avec la cartographie préalable de la zone d'étude (par exemple, un shapefile converti avec les limites de la zone). Elle est superposée à la carte pendant la collecte.",
            },
          },
          {
            icon: "routes",
            title: {
              pt: "Prepare a rota de campo",
              en: "Prepare the field route",
              es: "Prepare la ruta de campo",
              fr: "Préparez l'itinéraire de terrain",
            },
            description: {
              pt: "No mesmo card, em \"Rota\", importe um GeoJSON com o trajeto/transecto planejado para a visita. Ele aparece no mapa do projeto com um botão para centralizar a visualização na rota, ajudando a não se perder do planejamento em campo.",
              en: "In the same card, under \"Route\", import a GeoJSON with the planned track/transect for the visit. It appears on the project map with a button to center the view on the route, helping you stay on track with the field plan.",
              es: "En la misma tarjeta, en \"Ruta\", importe un GeoJSON con el trayecto/transecto planificado para la visita. Aparece en el mapa del proyecto con un botón para centrar la vista en la ruta, ayudando a no perder el rumbo planificado en campo.",
              fr: "Dans la même carte, sous « Itinéraire », importez un GeoJSON avec le trajet/transect planifié pour la visite. Il apparaît sur la carte du projet avec un bouton pour centrer la vue sur l'itinéraire, ce qui aide à rester fidèle au plan sur le terrain.",
            },
          },
          {
            icon: "leaf",
            title: {
              pt: "Prepare o catálogo de espécies",
              en: "Prepare the species catalog",
              es: "Prepare el catálogo de especies",
              fr: "Préparez le catalogue d'espèces",
            },
            description: {
              pt: "Em Detalhes do Projeto → Catálogo de Espécies → \"Gerenciar Catálogo\", busque ocorrências já registradas na região (GBIF ou SpeciesLink) para adiantar a identificação em campo, ou importe um catálogo \".json\" salvo de uma coleta anterior. Isso agiliza o Levantamento Florístico durante o preenchimento dos pontos.",
              en: "In Project Details → Species Catalog → \"Manage Catalog\", search for occurrences already recorded in the region (GBIF or SpeciesLink) to speed up field identification, or import a \".json\" catalog saved from a previous survey. This speeds up the Floristic Record while filling in points.",
              es: "En Detalles del Proyecto → Catálogo de Especies → \"Gestionar Catálogo\", busque ocurrencias ya registradas en la región (GBIF o SpeciesLink) para adelantar la identificación en campo, o importe un catálogo \".json\" guardado de una recolección anterior. Esto agiliza el Registro Florístico durante el llenado de los puntos.",
              fr: "Dans Détails du Projet → Catalogue d'Espèces → « Gérer le Catalogue », recherchez les occurrences déjà enregistrées dans la région (GBIF ou SpeciesLink) pour accélérer l'identification sur le terrain, ou importez un catalogue « .json » sauvegardé d'une collecte précédente. Cela accélère le Relevé Floristique lors du remplissage des points.",
            },
          },
        ],
      },
      {
        icon: "clipboard-text-outline",
        title: {
          pt: "Em Campo — Preenchendo um Ponto",
          en: "In the Field — Filling In a Point",
          es: "En Campo — Completando un Punto",
          fr: "Sur le Terrain — Remplir un Point",
        },
        intro: {
          pt: "Os cards do formulário aparecem sempre na mesma ordem, pensada para seguir a lógica de observação do protocolo. Preencha nessa ordem, de cima para baixo.",
          en: "The form cards always appear in the same order, designed to follow the protocol's observation logic. Fill them in that order, from top to bottom.",
          es: "Las tarjetas del formulario siempre aparecen en el mismo orden, pensado para seguir la lógica de observación del protocolo. Complételas en ese orden, de arriba hacia abajo.",
          fr: "Les cartes du formulaire apparaissent toujours dans le même ordre, pensé pour suivre la logique d'observation du protocole. Remplissez-les dans cet ordre, de haut en bas.",
        },
        steps: [
          {
            icon: "crosshairs-gps",
            title: {
              pt: "1. Criar o ponto",
              en: "1. Create the point",
              es: "1. Crear el punto",
              fr: "1. Créer le point",
            },
            description: {
              pt: "Capture a localização pelo GPS do aparelho ou marque manualmente no mapa. Coordenadas e altitude podem ser conferidas e ajustadas antes de avançar para o formulário.",
              en: "Capture the location via the device's GPS or mark it manually on the map. Coordinates and altitude can be checked and adjusted before moving on to the form.",
              es: "Capture la ubicación mediante el GPS del dispositivo o márquela manualmente en el mapa. Las coordenadas y la altitud pueden revisarse y ajustarse antes de continuar al formulario.",
              fr: "Capturez la position via le GPS de l'appareil ou marquez-la manuellement sur la carte. Les coordonnées et l'altitude peuvent être vérifiées et ajustées avant de passer au formulaire.",
            },
          },
          {
            icon: "check-circle-outline",
            title: {
              pt: "2. Verificação de Homogeneidade",
              en: "2. Homogeneity Check",
              es: "2. Verificación de Homogeneidad",
              fr: "2. Vérification de l'Homogénéité",
            },
            description: {
              pt: "Confirme que a área ao redor do ponto é homogênea na escala de coleta adotada. Esse é o primeiro campo do formulário e é obrigatório para poder salvar o ponto.",
              en: "Confirm that the area around the point is homogeneous at the adopted collection scale. This is the form's first field and is required to save the point.",
              es: "Confirme que el área alrededor del punto es homogénea en la escala de recolección adoptada. Este es el primer campo del formulario y es obligatorio para poder guardar el punto.",
              fr: "Confirmez que la zone autour du point est homogène à l'échelle de collecte adoptée. C'est le premier champ du formulaire et il est obligatoire pour pouvoir enregistrer le point.",
            },
          },
          {
            icon: "vector-square",
            title: {
              pt: "3. Tamanho da Parcela",
              en: "3. Plot Size",
              es: "3. Tamaño de la Parcela",
              fr: "3. Taille de la Parcelle",
            },
            description: {
              pt: "Informe a área observada, em m². Recomenda-se parcelas entre 100 m² e 2.500 m², dependendo da escala do estudo.",
              en: "Enter the observed area, in m². Plots between 100 m² and 2,500 m² are recommended, depending on the study's scale.",
              es: "Indique el área observada, en m². Se recomiendan parcelas entre 100 m² y 2.500 m², dependiendo de la escala del estudio.",
              fr: "Indiquez la superficie observée, en m². Des parcelles de 100 m² à 2 500 m² sont recommandées, selon l'échelle de l'étude.",
            },
          },
          {
            icon: "sprout-outline",
            title: {
              pt: "4. Estado de Conservação",
              en: "4. Conservation Status",
              es: "4. Estado de Conservación",
              fr: "4. État de Conservation",
            },
            description: {
              pt: "Classifique a vegetação como Conservada, Em Regeneração (Nativas), Em Regeneração (Consorciada com Invasoras) ou Substituída. Se marcar \"Substituída\", um campo de Uso da Terra aparece (cultivo, pasto, construções, etc.) e os cards de Estrutura da Vegetação e Levantamento Florístico somem do formulário — nesse caso não faz sentido classificar uma vegetação que não existe mais no ponto.",
              en: "Classify the vegetation as Conserved, Regenerating (Native), Regenerating (Mixed with Invasives), or Substituted. If you select \"Substituted\", a Land Use field appears (crops, pasture, buildings, etc.) and the Vegetation Structure and Floristic Record cards disappear from the form — in that case, classifying vegetation that no longer exists at the point doesn't make sense.",
              es: "Clasifique la vegetación como Conservada, En Regeneración (Nativas), En Regeneración (Consorciada con Invasoras) o Sustituida. Si marca \"Sustituida\", aparece un campo de Uso de la Tierra (cultivo, pasto, construcciones, etc.) y las tarjetas de Estructura de la Vegetación y Registro Florístico desaparecen del formulario — en ese caso no tiene sentido clasificar una vegetación que ya no existe en el punto.",
              fr: "Classez la végétation comme Conservée, En Régénération (Natives), En Régénération (Mélangée avec des Envahissantes) ou Substituée. Si vous cochez « Substituée », un champ Usage des Terres apparaît (culture, pâturage, constructions, etc.) et les cartes Structure de la Végétation et Relevé Floristique disparaissent du formulaire — dans ce cas, classer une végétation qui n'existe plus au point n'a pas de sens.",
            },
          },
          {
            icon: "grid",
            title: {
              pt: "5. Estrutura da Vegetação — Matriz de Küchler (1988)",
              en: "5. Vegetation Structure — Küchler Matrix (1988)",
              es: "5. Estructura de la Vegetación — Matriz de Küchler (1988)",
              fr: "5. Structure de la Végétation — Matrice de Küchler (1988)",
            },
            description: {
              pt: "A matriz cruza 8 classes de altura (das \"Árvores emergentes\", acima de 35 m, até as \"Rasteiras/Herbáceas baixas\", abaixo de 0,1 m) com as formas de vida presentes em cada estrato (lenhosas, herbáceas e especiais, como lianas e epífitas). Para cada célula preenchida, indique também a cobertura (Contínua >75% até Esparsa 1–5%) e, quando fizer sentido, a adaptação foliar. \n\nRegra geral: preencha e confira sempre do estrato mais alto para o mais baixo. Você pode tocar nas células em qualquer ordem, mas a fórmula fisionômica e a descrição textual do ponto são sempre montadas nessa sequência (do mais alto ao mais baixo) — revisar fora dessa ordem facilita esquecer um estrato. O app também trava a cobertura em 100% por estrato: ao chegar no limite, novas formas de vida naquela altura ficam desabilitadas até você ajustar as já lançadas. \n\nCom base no formulário preenchido, o Nomos sugere automaticamente o nome da fisionomia (classes C1 a C5 da classificação de Küchler, por exemplo \"Floresta densa\" ou \"Formação herbácea\"), que pode ser editado manualmente se necessário. Alternativamente, o projeto pode usar uma classificação de vegetação personalizada (gerenciável em Detalhes do Projeto) no lugar da classificação de Küchler.",
              en: "The matrix crosses 8 height classes (from \"Emergent trees\", above 35 m, down to \"Low creeping/herbaceous plants\", below 0.1 m) with the life forms present at each stratum (woody, herbaceous, and special forms such as lianas and epiphytes). For each filled cell, also indicate the cover (Continuous >75% down to Sparse 1–5%) and, when relevant, the leaf adaptation. \n\nGeneral rule: always fill in and review from the tallest stratum to the shortest. You can tap the cells in any order, but the physiognomic formula and the point's text description are always assembled in that sequence (tallest to shortest) — reviewing out of that order makes it easy to forget a stratum. The app also caps cover at 100% per stratum: once the limit is reached, new life forms at that height are disabled until you adjust the ones already entered. \n\nBased on the filled-in form, Nomos automatically suggests the physiognomy name (Küchler classification classes C1 to C5, e.g. \"Dense forest\" or \"Herbaceous formation\"), which can be edited manually if needed. Alternatively, the project can use a custom vegetation classification (manageable from Project Details) instead of the Küchler classification.",
              es: "La matriz cruza 8 clases de altura (desde \"Árboles emergentes\", por encima de 35 m, hasta \"Rastreras/Herbáceas bajas\", por debajo de 0,1 m) con las formas de vida presentes en cada estrato (leñosas, herbáceas y especiales, como lianas y epífitas). Para cada celda completada, indique también la cobertura (Continua >75% hasta Escasa 1–5%) y, cuando corresponda, la adaptación foliar. \n\nRegla general: complete y revise siempre desde el estrato más alto hasta el más bajo. Puede tocar las celdas en cualquier orden, pero la fórmula fisionómica y la descripción textual del punto siempre se arman en esa secuencia (del más alto al más bajo) — revisar fuera de ese orden facilita olvidar un estrato. La aplicación también limita la cobertura al 100% por estrato: al alcanzar el límite, las nuevas formas de vida en esa altura quedan deshabilitadas hasta que ajuste las ya registradas. \n\nCon base en el formulario completado, Nomos sugiere automáticamente el nombre de la fisionomía (clases C1 a C5 de la clasificación de Küchler, por ejemplo \"Bosque denso\" o \"Formación herbácea\"), que puede editarse manualmente si es necesario. Alternativamente, el proyecto puede usar una clasificación de vegetación personalizada (gestionable en Detalles del Proyecto) en lugar de la clasificación de Küchler.",
              fr: "La matrice croise 8 classes de hauteur (des « Arbres émergents », au-dessus de 35 m, jusqu'aux « Plantes rampantes/herbacées basses », en dessous de 0,1 m) avec les formes de vie présentes à chaque strate (ligneuses, herbacées et spéciales, comme les lianes et les épiphytes). Pour chaque cellule remplie, indiquez également la couverture (Continue >75% jusqu'à Éparse 1–5%) et, le cas échéant, l'adaptation foliaire. \n\nRègle générale : remplissez et vérifiez toujours de la strate la plus haute à la plus basse. Vous pouvez toucher les cellules dans n'importe quel ordre, mais la formule physionomique et la description textuelle du point sont toujours construites dans cette séquence (de la plus haute à la plus basse) — réviser dans un autre ordre facilite l'oubli d'une strate. L'application plafonne également la couverture à 100% par strate : une fois la limite atteinte, les nouvelles formes de vie à cette hauteur sont désactivées jusqu'à ce que vous ajustiez celles déjà saisies. \n\nSur la base du formulaire rempli, Nomos suggère automatiquement le nom de la physionomie (classes C1 à C5 de la classification de Küchler, par exemple « Forêt dense » ou « Formation herbacée »), qui peut être modifié manuellement si nécessaire. Le projet peut également utiliser une classification de végétation personnalisée (gérable depuis Détails du Projet) à la place de la classification de Küchler.",
            },
          },
          {
            icon: "flower-outline",
            title: {
              pt: "6. Levantamento Florístico",
              en: "6. Floristic Record",
              es: "6. Registro Florístico",
              fr: "6. Relevé Floristique",
            },
            description: {
              pt: "Registre as espécies identificadas no ponto, buscando no catálogo preparado antes de ir a campo (ou cadastrando manualmente). É um complemento ao código de Küchler, não um substituto — a estrutura da vegetação continua vindo da matriz.",
              en: "Record the species identified at the point, searching the catalog prepared before going to the field (or adding them manually). It's a complement to the Küchler code, not a substitute — vegetation structure still comes from the matrix.",
              es: "Registre las especies identificadas en el punto, buscando en el catálogo preparado antes de ir a campo (o registrándolas manualmente). Es un complemento al código de Küchler, no un sustituto — la estructura de la vegetación sigue proviniendo de la matriz.",
              fr: "Enregistrez les espèces identifiées au point, en recherchant dans le catalogue préparé avant d'aller sur le terrain (ou en les ajoutant manuellement). C'est un complément au code de Küchler, pas un substitut — la structure de la végétation continue de provenir de la matrice.",
            },
          },
          {
            icon: "terrain",
            title: {
              pt: "7. Condicionantes Geoecológicos",
              en: "7. Geoecological Constraints",
              es: "7. Condicionantes Geoecológicos",
              fr: "7. Contraintes Géoécologiques",
            },
            description: {
              pt: "Primeiro os cinco campos sobre o relevo do ponto: Exposição (barlavento/sotavento), Declive (de plano a íngreme), Posição Topográfica (topo/intermediária/inferior), Forma do Relevo (côncava/retilínea/convexa) e Ambiente Geomorfológico (múltipla escolha: encosta, fluvial, lacustre, eólico, cársico, estuarino, praial, deltaico, costeiro erosivo). Depois a Cobertura e Superfície: serrapilheira, pedregosidade, rochosidade e solo exposto, cada um em faixas percentuais. Por fim a Descrição do Solo, no modo Simples (uma descrição geral) ou Detalhado (camadas/horizontes com profundidade, textura, estrutura, cor e observações como presença de cascalho, raízes ou lençol freático). \n\nNo modo Detalhado, descreva as camadas sempre de cima para baixo: cada nova camada precisa começar exatamente onde a camada mais profunda já cadastrada termina, e o app impede sobreposições entre camadas.",
              en: "First, five fields about the point's terrain: Exposure (windward/leeward), Slope (from flat to steep), Topographic Position (top/middle/bottom), Landform Shape (concave/straight/convex), and Geomorphological Environment (multiple choice: hillside, fluvial, lacustrine, aeolian, karst, estuarine, beach, deltaic, erosive coastal). Then Cover and Surface: litter layer, stoniness, rockiness, and bare soil, each in percentage ranges. Finally, Soil Description, in Simple mode (a general description) or Detailed mode (layers/horizons with depth, texture, structure, color, and notes such as the presence of gravel, roots, or a water table). \n\nIn Detailed mode, always describe layers from top to bottom: each new layer must start exactly where the deepest layer already entered ends, and the app prevents overlapping layers.",
              es: "Primero, cinco campos sobre el relieve del punto: Exposición (barlovento/sotavento), Pendiente (de plana a escarpada), Posición Topográfica (superior/intermedia/inferior), Forma del Relieve (cóncava/rectilínea/convexa) y Ambiente Geomorfológico (selección múltiple: de ladera, fluvial, lacustre, eólico, kárstico, estuarino, de playa, deltaico, costero erosivo). Luego Cobertura y Superficie: hojarasca, pedregosidad, rocosidad y suelo expuesto, cada uno en rangos porcentuales. Por último, Descripción del Suelo, en modo Simple (una descripción general) o Detallado (capas/horizontes con profundidad, textura, estructura, color y observaciones como presencia de grava, raíces o nivel freático). \n\nEn el modo Detallado, describa las capas siempre de arriba hacia abajo: cada nueva capa debe comenzar exactamente donde termina la capa más profunda ya registrada, y la aplicación impide superposiciones entre capas.",
              fr: "D'abord, cinq champs sur le relief du point : Exposition (au vent/sous le vent), Pente (de plane à escarpée), Position Topographique (sommet/intermédiaire/inférieure), Forme du Relief (concave/rectiligne/convexe) et Environnement Géomorphologique (choix multiple : de versant, fluvial, lacustre, éolien, karstique, estuarien, de plage, deltaïque, côtier érosif). Puis Couverture et Surface : litière, pierrosité, rocaillosité et sol nu, chacun par tranches de pourcentage. Enfin, Description du Sol, en mode Simple (une description générale) ou Détaillé (couches/horizons avec profondeur, texture, structure, couleur et observations telles que la présence de graviers, de racines ou d'une nappe phréatique). \n\nEn mode Détaillé, décrivez toujours les couches de haut en bas : chaque nouvelle couche doit commencer exactement là où se termine la couche la plus profonde déjà enregistrée, et l'application empêche les chevauchements entre couches.",
            },
          },
          {
            icon: "alert-outline",
            title: {
              pt: "8. Impactos Ambientais",
              en: "8. Environmental Impacts",
              es: "8. Impactos Ambientales",
              fr: "8. Impacts Environnementaux",
            },
            description: {
              pt: "Lista livre de impactos observados no entorno (erosão, poluição, espécies invasoras, fogo, mineração, sobrepastoreio, etc.), cada um com um tipo, uma magnitude (Ocasional, Comum ou Crítico) e detalhes em texto livre. Tipo e magnitude alimentam o algoritmo que gera o nome da paisagem do ponto.",
              en: "A free list of impacts observed nearby (erosion, pollution, invasive species, fire, mining, overgrazing, etc.), each with a type, a magnitude (Occasional, Common, or Critical), and free-text details. Type and magnitude feed the algorithm that generates the point's landscape name.",
              es: "Lista libre de impactos observados en el entorno (erosión, contaminación, especies invasoras, fuego, minería, sobrepastoreo, etc.), cada uno con un tipo, una magnitud (Ocasional, Común o Crítica) y detalles en texto libre. El tipo y la magnitud alimentan el algoritmo que genera el nombre del paisaje del punto.",
              fr: "Liste libre des impacts observés aux alentours (érosion, pollution, espèces envahissantes, feu, exploitation minière, surpâturage, etc.), chacun avec un type, une magnitude (Occasionnelle, Courante ou Critique) et des détails en texte libre. Le type et la magnitude alimentent l'algorithme qui génère le nom du paysage du point.",
            },
          },
          {
            icon: "camera-outline",
            title: {
              pt: "9. Fotos e Notas",
              en: "9. Photos and Notes",
              es: "9. Fotos y Notas",
              fr: "9. Photos et Notes",
            },
            description: {
              pt: "Anexe fotos do ponto e notas complementares em texto ou áudio antes de salvar.",
              en: "Attach photos of the point and additional notes, in text or audio, before saving.",
              es: "Adjunte fotos del punto y notas adicionales, en texto o audio, antes de guardar.",
              fr: "Joignez des photos du point et des notes complémentaires, en texte ou en audio, avant d'enregistrer.",
            },
          },
          {
            icon: "content-save-outline",
            title: {
              pt: "10. Salvar",
              en: "10. Save",
              es: "10. Guardar",
              fr: "10. Enregistrer",
            },
            description: {
              pt: "Ao salvar, o Nomos gera automaticamente o \"Nome da Paisagem\" do ponto, combinando a vegetação, o ambiente geomorfológico e os impactos mais relevantes registrados (por exemplo, \"Floresta densa sobre encosta, influenciada por erosão\"). Esse nome também é usado depois para agrupar pontos semelhantes ao classificar a coleta do projeto.",
              en: "When you save, Nomos automatically generates the point's \"Landscape Name\", combining the vegetation, the geomorphological environment, and the most relevant recorded impacts (for example, \"Dense forest over hillside, influenced by erosion\"). This name is also used later to group similar points when classifying the project's collection.",
              es: "Al guardar, Nomos genera automáticamente el \"Nombre del Paisaje\" del punto, combinando la vegetación, el ambiente geomorfológico y los impactos más relevantes registrados (por ejemplo, \"Bosque denso sobre ladera, influenciado por erosión\"). Este nombre también se usa después para agrupar puntos similares al clasificar la recolección del proyecto.",
              fr: "Lors de l'enregistrement, Nomos génère automatiquement le « Nom du Paysage » du point, combinant la végétation, l'environnement géomorphologique et les impacts les plus pertinents enregistrés (par exemple, « Forêt dense sur versant, influencée par l'érosion »). Ce nom est également utilisé ensuite pour regrouper les points similaires lors de la classification de la collecte du projet.",
            },
          },
        ],
      },
      {
        icon: "export-variant",
        title: { pt: "Pós-Campo", en: "Post-Field", es: "Post-Campo", fr: "Après le Terrain" },
        steps: [
          {
            icon: "database-export",
            title: {
              pt: "Exportar os dados coletados",
              en: "Export the collected data",
              es: "Exportar los datos recolectados",
              fr: "Exporter les données collectées",
            },
            description: {
              pt: "Em Detalhes do Projeto, use o botão flutuante (canto inferior direito) para exportar em CSV, GeoJSON, ou extrair as mídias (fotos e áudios) de todos os pontos do projeto.",
              en: "In Project Details, use the floating button (bottom right corner) to export as CSV, GeoJSON, or extract the media (photos and audio) from all points in the project.",
              es: "En Detalles del Proyecto, use el botón flotante (esquina inferior derecha) para exportar en CSV, GeoJSON, o extraer los archivos multimedia (fotos y audios) de todos los puntos del proyecto.",
              fr: "Dans Détails du Projet, utilisez le bouton flottant (coin inférieur droit) pour exporter en CSV, GeoJSON, ou extraire les médias (photos et audios) de tous les points du projet.",
            },
          },
        ],
      },
    ],
  },
  custom: {
    sections: [
      {
        icon: "hammer-wrench",
        title: {
          pt: "Montando seu Protocolo",
          en: "Building Your Protocol",
          es: "Armando su Protocolo",
          fr: "Créer votre Protocole",
        },
        intro: {
          pt: "Um protocolo personalizado é montado na tela \"Protocolo\" → \"+ Adicionar Protocolo\", sem escrever código: você define seções e campos, e o Nomos gera o formulário de campo e a exportação automaticamente.",
          en: "A custom protocol is built on the \"Protocol\" screen → \"+ Add Protocol\", with no coding required: you define sections and fields, and Nomos automatically generates the field form and the export.",
          es: "Un protocolo personalizado se arma en la pantalla \"Protocolo\" → \"+ Agregar Protocolo\", sin escribir código: usted define secciones y campos, y Nomos genera el formulario de campo y la exportación automáticamente.",
          fr: "Un protocole personnalisé se construit dans l'écran « Protocole » → « + Ajouter un Protocole », sans écrire de code : vous définissez des sections et des champs, et Nomos génère automatiquement le formulaire de terrain et l'export.",
        },
        steps: [
          {
            icon: "information-outline",
            title: {
              pt: "1. Informações do Protocolo",
              en: "1. Protocol Information",
              es: "1. Información del Protocolo",
              fr: "1. Informations sur le Protocole",
            },
            description: {
              pt: "Preencha nome e tema (obrigatórios), descrição e instruções de coleta (opcionais, exibidas para quem for preencher os pontos em campo).",
              en: "Fill in the name and theme (required), description and collection instructions (optional, shown to whoever fills in points in the field).",
              es: "Complete el nombre y el tema (obligatorios), la descripción y las instrucciones de recolección (opcionales, mostradas a quien vaya a completar los puntos en campo).",
              fr: "Renseignez le nom et le thème (obligatoires), la description et les instructions de collecte (facultatives, affichées à la personne qui remplira les points sur le terrain).",
            },
          },
          {
            icon: "view-agenda-outline",
            title: {
              pt: "2. Adicionar Seções",
              en: "2. Add Sections",
              es: "2. Agregar Secciones",
              fr: "2. Ajouter des Sections",
            },
            description: {
              pt: "Organize o protocolo em seções temáticas (\"Adicionar Seção\"). Cada seção vira um card no formulário de campo, com um título e uma descrição opcional.",
              en: "Organize the protocol into thematic sections (\"Add Section\"). Each section becomes a card in the field form, with a title and an optional description.",
              es: "Organice el protocolo en secciones temáticas (\"Agregar Sección\"). Cada sección se convierte en una tarjeta en el formulario de campo, con un título y una descripción opcional.",
              fr: "Organisez le protocole en sections thématiques (« Ajouter une Section »). Chaque section devient une carte dans le formulaire de terrain, avec un titre et une description facultative.",
            },
          },
          {
            icon: "plus-box-outline",
            title: {
              pt: "3. Adicionar Campos",
              en: "3. Add Fields",
              es: "3. Agregar Campos",
              fr: "3. Ajouter des Champs",
            },
            description: {
              pt: "Dentro de cada seção, toque em \"Adicionar Campo\" e escolha o tipo (veja a lista completa na próxima seção deste tutorial), o rótulo, se é obrigatório e as opções específicas do tipo escolhido (lista de opções, unidade, mínimo/máximo, etc.).",
              en: "Within each section, tap \"Add Field\" and choose the type (see the full list in the next section of this tutorial), the label, whether it's required, and the options specific to the chosen type (option list, unit, minimum/maximum, etc.).",
              es: "Dentro de cada sección, toque \"Agregar Campo\" y elija el tipo (vea la lista completa en la siguiente sección de este tutorial), la etiqueta, si es obligatorio y las opciones específicas del tipo elegido (lista de opciones, unidad, mínimo/máximo, etc.).",
              fr: "Dans chaque section, appuyez sur « Ajouter un Champ » et choisissez le type (voir la liste complète dans la section suivante de ce tutoriel), le libellé, s'il est obligatoire, et les options spécifiques au type choisi (liste d'options, unité, minimum/maximum, etc.).",
            },
          },
          {
            icon: "flask-outline",
            title: {
              pt: "4. Anexar um módulo científico (opcional)",
              en: "4. Attach a scientific module (optional)",
              es: "4. Anexar un módulo científico (opcional)",
              fr: "4. Attacher un module scientifique (optionnel)",
            },
            description: {
              pt: "Em vez de montar campos do zero, você pode anexar um módulo pronto do protocolo Paisageo — Vegetação, Condicionantes Geoecológicos ou Impactos — pelo botão \"Adicionar Módulo Científico\". A seção anexada usa exatamente as mesmas regras e exportação desse módulo no Paisageo (incluindo a matriz de Küchler, se anexar Vegetação). Cada módulo só pode ser anexado uma vez por protocolo.",
              en: "Instead of building fields from scratch, you can attach a ready-made module from the Paisageo protocol — Vegetation, Geoecological Constraints, or Impacts — via the \"Add Scientific Module\" button. The attached section uses exactly the same rules and export as that module in Paisageo (including the Küchler matrix, if you attach Vegetation). Each module can only be attached once per protocol.",
              es: "En lugar de armar campos desde cero, puede anexar un módulo ya preparado del protocolo Paisageo — Vegetación, Condicionantes Geoecológicos o Impactos — mediante el botón \"Agregar Módulo Científico\". La sección anexada usa exactamente las mismas reglas y exportación de ese módulo en Paisageo (incluida la matriz de Küchler, si anexa Vegetación). Cada módulo solo puede anexarse una vez por protocolo.",
              fr: "Au lieu de créer des champs à partir de zéro, vous pouvez attacher un module prêt à l'emploi du protocole Paisageo — Végétation, Contraintes Géoécologiques ou Impacts — via le bouton « Ajouter un Module Scientifique ». La section attachée utilise exactement les mêmes règles et le même export que ce module dans Paisageo (y compris la matrice de Küchler, si vous attachez Végétation). Chaque module ne peut être attaché qu'une seule fois par protocole.",
            },
          },
          {
            icon: "content-save-outline",
            title: {
              pt: "5. Salvar",
              en: "5. Save",
              es: "5. Guardar",
              fr: "5. Enregistrer",
            },
            description: {
              pt: "Revise e toque em \"Criar Protocolo\". Atenção: hoje não é possível reordenar seções ou campos depois de criados — a ordem de exibição é a ordem em que foram adicionados, então vale planejar a sequência antes de começar.",
              en: "Review and tap \"Create Protocol\". Note: it's currently not possible to reorder sections or fields after they're created — the display order is the order in which they were added, so it's worth planning the sequence before you start.",
              es: "Revise y toque \"Crear Protocolo\". Atención: actualmente no es posible reordenar secciones o campos después de creados — el orden de visualización es el orden en que fueron agregados, así que conviene planificar la secuencia antes de empezar.",
              fr: "Vérifiez puis appuyez sur « Créer un Protocole ». Attention : il n'est actuellement pas possible de réorganiser les sections ou les champs après leur création — l'ordre d'affichage est celui dans lequel ils ont été ajoutés, il vaut donc mieux planifier la séquence avant de commencer.",
            },
          },
        ],
      },
      {
        icon: "format-list-bulleted-type",
        title: {
          pt: "Tipos de Campo Disponíveis",
          en: "Available Field Types",
          es: "Tipos de Campo Disponibles",
          fr: "Types de Champs Disponibles",
        },
        intro: {
          pt: "17 tipos de campo cobrem a maioria das necessidades de um formulário de campo:",
          en: "17 field types cover most of a field form's needs:",
          es: "17 tipos de campo cubren la mayoría de las necesidades de un formulario de campo:",
          fr: "17 types de champs couvrent la plupart des besoins d'un formulaire de terrain :",
        },
        steps: [
          {
            icon: "text-short",
            title: { pt: "Texto Curto", en: "Short Text", es: "Texto Corto", fr: "Texte Court" },
            description: {
              pt: "Campo de texto de uma linha.",
              en: "A single-line text field.",
              es: "Campo de texto de una línea.",
              fr: "Champ de texte sur une seule ligne.",
            },
          },
          {
            icon: "text-long",
            title: { pt: "Texto Longo", en: "Long Text", es: "Texto Largo", fr: "Texte Long" },
            description: {
              pt: "Campo de texto multilinha, para descrições mais longas.",
              en: "A multiline text field, for longer descriptions.",
              es: "Campo de texto multilínea, para descripciones más largas.",
              fr: "Champ de texte multiligne, pour des descriptions plus longues.",
            },
          },
          {
            icon: "numeric",
            title: { pt: "Número", en: "Number", es: "Número", fr: "Nombre" },
            description: {
              pt: "Campo numérico, com mínimo, máximo e unidade opcionais (curada, como cm, m, ha, kg, °C, % — ou uma unidade personalizada).",
              en: "A numeric field, with optional minimum, maximum, and unit (curated, such as cm, m, ha, kg, °C, % — or a custom unit).",
              es: "Campo numérico, con mínimo, máximo y unidad opcionales (seleccionable, como cm, m, ha, kg, °C, % — o una unidad personalizada).",
              fr: "Champ numérique, avec minimum, maximum et unité facultatifs (sélectionnable, comme cm, m, ha, kg, °C, % — ou une unité personnalisée).",
            },
          },
          {
            icon: "percent",
            title: { pt: "Porcentagem", en: "Percentage", es: "Porcentaje", fr: "Pourcentage" },
            description: {
              pt: "Numérico de 0 a 100, com o símbolo % já implícito.",
              en: "Numeric from 0 to 100, with the % symbol already implied.",
              es: "Numérico de 0 a 100, con el símbolo % ya implícito.",
              fr: "Numérique de 0 à 100, avec le symbole % déjà implicite.",
            },
          },
          {
            icon: "compass-outline",
            title: { pt: "Azimute", en: "Azimuth", es: "Azimut", fr: "Azimut" },
            description: {
              pt: "Ângulo de 0 a 360°, exibindo o ponto cardeal correspondente.",
              en: "An angle from 0 to 360°, displaying the corresponding cardinal point.",
              es: "Un ángulo de 0 a 360°, mostrando el punto cardinal correspondiente.",
              fr: "Un angle de 0 à 360°, affichant le point cardinal correspondant.",
            },
          },
          {
            icon: "calendar",
            title: { pt: "Data", en: "Date", es: "Fecha", fr: "Date" },
            description: {
              pt: "Seletor de data (DD/MM/AAAA).",
              en: "A date picker (DD/MM/YYYY).",
              es: "Selector de fecha (DD/MM/AAAA).",
              fr: "Un sélecteur de date (JJ/MM/AAAA).",
            },
          },
          {
            icon: "clock-outline",
            title: { pt: "Hora", en: "Time", es: "Hora", fr: "Heure" },
            description: {
              pt: "Seletor de horário (HH:MM).",
              en: "A time picker (HH:MM).",
              es: "Selector de hora (HH:MM).",
              fr: "Un sélecteur d'heure (HH:MM).",
            },
          },
          {
            icon: "radiobox-marked",
            title: { pt: "Múltipla Escolha", en: "Multiple Choice", es: "Elección Múltiple", fr: "Choix Multiple" },
            description: {
              pt: "Seleção única entre opções definidas por você, cada uma com uma descrição opcional.",
              en: "A single selection among options you define, each with an optional description.",
              es: "Selección única entre opciones definidas por usted, cada una con una descripción opcional.",
              fr: "Une sélection unique parmi des options que vous définissez, chacune avec une description facultative.",
            },
          },
          {
            icon: "checkbox-marked",
            title: { pt: "Caixas de Seleção", en: "Checkboxes", es: "Casillas de Selección", fr: "Cases à Cocher" },
            description: {
              pt: "Seleção múltipla entre opções definidas por você.",
              en: "Multiple selection among options you define.",
              es: "Selección múltiple entre opciones definidas por usted.",
              fr: "Sélection multiple parmi des options que vous définissez.",
            },
          },
          {
            icon: "help-circle-outline",
            title: { pt: "Sim/Não", en: "Yes/No", es: "Sí/No", fr: "Oui/Non" },
            description: {
              pt: "Campo booleano simples.",
              en: "A simple boolean field.",
              es: "Campo booleano simple.",
              fr: "Un champ booléen simple.",
            },
          },
          {
            icon: "star-outline",
            title: { pt: "Avaliação", en: "Rating", es: "Calificación", fr: "Note" },
            description: {
              pt: "Escala de avaliação (ex.: 1 a 5 estrelas); o máximo é obrigatório, o mínimo é sempre 0.",
              en: "A rating scale (e.g., 1 to 5 stars); the maximum is required, the minimum is always 0.",
              es: "Escala de calificación (ej.: 1 a 5 estrellas); el máximo es obligatorio, el mínimo siempre es 0.",
              fr: "Une échelle de notation (ex. : 1 à 5 étoiles) ; le maximum est obligatoire, le minimum est toujours 0.",
            },
          },
          {
            icon: "camera-outline",
            title: { pt: "Fotos", en: "Photos", es: "Fotos", fr: "Photos" },
            description: {
              pt: "Captura ou upload de fotos.",
              en: "Photo capture or upload.",
              es: "Captura o carga de fotos.",
              fr: "Capture ou téléversement de photos.",
            },
          },
          {
            icon: "tag-multiple-outline",
            title: { pt: "Lista de Itens", en: "Item List", es: "Lista de Ítems", fr: "Liste d'Éléments" },
            description: {
              pt: "Lista de itens/etiquetas de texto livre.",
              en: "A list of free-text items/tags.",
              es: "Lista de ítems/etiquetas de texto libre.",
              fr: "Une liste d'éléments/étiquettes en texte libre.",
            },
          },
          {
            icon: "leaf",
            title: { pt: "Registro Florístico", en: "Floristic Record", es: "Registro Florístico", fr: "Registre Floristique" },
            description: {
              pt: "Catálogo de espécies com busca em bases externas (GBIF/SpeciesLink) — o mesmo campo usado no Paisageo.",
              en: "A species catalog with search in external databases (GBIF/SpeciesLink) — the same field used in Paisageo.",
              es: "Catálogo de especies con búsqueda en bases externas (GBIF/SpeciesLink) — el mismo campo usado en Paisageo.",
              fr: "Un catalogue d'espèces avec recherche dans des bases externes (GBIF/SpeciesLink) — le même champ utilisé dans Paisageo.",
            },
          },
          {
            icon: "note-text-outline",
            title: { pt: "Notas de Texto", en: "Text Notes", es: "Notas de Texto", fr: "Notes Écrites" },
            description: {
              pt: "Lista de notas em texto livre.",
              en: "A list of free-text notes.",
              es: "Lista de notas en texto libre.",
              fr: "Une liste de notes en texte libre.",
            },
          },
          {
            icon: "microphone-outline",
            title: { pt: "Notas de Áudio", en: "Audio Notes", es: "Notas de Audio", fr: "Notes Audio" },
            description: {
              pt: "Gravações de áudio anexadas ao ponto.",
              en: "Audio recordings attached to the point.",
              es: "Grabaciones de audio adjuntas al punto.",
              fr: "Enregistrements audio joints au point.",
            },
          },
          {
            icon: "format-list-group",
            title: { pt: "Grupo Repetível", en: "Repeatable Group", es: "Grupo Repetible", fr: "Groupe Répétable" },
            description: {
              pt: "Grupo de subcampos que se repete quantas vezes for preciso (por exemplo, uma lista de indivíduos amostrados, cada um com seus próprios campos). Não pode conter outro Grupo Repetível dentro dele.",
              en: "A group of subfields that repeats as many times as needed (for example, a list of sampled individuals, each with its own fields). It cannot contain another Repeatable Group inside it.",
              es: "Grupo de subcampos que se repite tantas veces como sea necesario (por ejemplo, una lista de individuos muestreados, cada uno con sus propios campos). No puede contener otro Grupo Repetible dentro de él.",
              fr: "Un groupe de sous-champs qui se répète autant de fois que nécessaire (par exemple, une liste d'individus échantillonnés, chacun avec ses propres champs). Il ne peut pas contenir un autre Groupe Répétable en son sein.",
            },
          },
        ],
      },
      {
        icon: "file-document-edit-outline",
        title: {
          pt: "Usando o Protocolo",
          en: "Using the Protocol",
          es: "Usando el Protocolo",
          fr: "Utiliser le Protocole",
        },
        steps: [
          {
            icon: "folder-plus-outline",
            title: {
              pt: "Criar um projeto com o protocolo",
              en: "Create a project with the protocol",
              es: "Crear un proyecto con el protocolo",
              fr: "Créer un projet avec le protocole",
            },
            description: {
              pt: "Em \"Novo Projeto\", seu protocolo personalizado aparece na lista de protocolos disponíveis, ao lado dos protocolos nativos. Ao selecioná-lo, o Nomos monta o formulário de campo automaticamente a partir das seções e campos definidos.",
              en: "In \"New Project\", your custom protocol appears in the list of available protocols, alongside the native protocols. When you select it, Nomos automatically builds the field form from the defined sections and fields.",
              es: "En \"Nuevo Proyecto\", su protocolo personalizado aparece en la lista de protocolos disponibles, junto a los protocolos nativos. Al seleccionarlo, Nomos arma automáticamente el formulario de campo a partir de las secciones y campos definidos.",
              fr: "Dans « Nouveau Projet », votre protocole personnalisé apparaît dans la liste des protocoles disponibles, aux côtés des protocoles natifs. En le sélectionnant, Nomos construit automatiquement le formulaire de terrain à partir des sections et champs définis.",
            },
          },
          {
            icon: "clipboard-check-outline",
            title: {
              pt: "Preencher pontos",
              en: "Fill in points",
              es: "Completar puntos",
              fr: "Remplir les points",
            },
            description: {
              pt: "O preenchimento de pontos funciona como no Paisageo: cada seção vira um card, na ordem em que foi criada, e os campos obrigatórios precisam ser preenchidos para salvar o ponto.",
              en: "Filling in points works just like in Paisageo: each section becomes a card, in the order it was created, and required fields must be filled in to save the point.",
              es: "El llenado de puntos funciona como en Paisageo: cada sección se convierte en una tarjeta, en el orden en que fue creada, y los campos obligatorios deben completarse para guardar el punto.",
              fr: "Le remplissage des points fonctionne comme dans Paisageo : chaque section devient une carte, dans l'ordre où elle a été créée, et les champs obligatoires doivent être remplis pour enregistrer le point.",
            },
          },
        ],
      },
      {
        icon: "share-variant-outline",
        title: {
          pt: "Exportação e Compartilhamento",
          en: "Export and Sharing",
          es: "Exportación y Compartición",
          fr: "Export et Partage",
        },
        steps: [
          {
            icon: "database-export",
            title: {
              pt: "Exportar os dados coletados",
              en: "Export the collected data",
              es: "Exportar los datos recolectados",
              fr: "Exporter les données collectées",
            },
            description: {
              pt: "CSV e GeoJSON são gerados automaticamente a partir dos campos do protocolo, sem nenhuma configuração extra — cada campo vira uma ou mais colunas (grupos repetíveis geram colunas numeradas por item).",
              en: "CSV and GeoJSON are generated automatically from the protocol's fields, with no extra configuration — each field becomes one or more columns (repeatable groups generate columns numbered per item).",
              es: "CSV y GeoJSON se generan automáticamente a partir de los campos del protocolo, sin ninguna configuración adicional — cada campo se convierte en una o más columnas (los grupos repetibles generan columnas numeradas por ítem).",
              fr: "CSV et GeoJSON sont générés automatiquement à partir des champs du protocole, sans aucune configuration supplémentaire — chaque champ devient une ou plusieurs colonnes (les groupes répétables génèrent des colonnes numérotées par élément).",
            },
          },
          {
            icon: "file-swap-outline",
            title: {
              pt: "Compartilhar o protocolo em si",
              en: "Share the protocol itself",
              es: "Compartir el protocolo en sí",
              fr: "Partager le protocole lui-même",
            },
            description: {
              pt: "Além de exportar os dados coletados, você pode exportar a definição do protocolo (nome, seções, campos) como um arquivo \".json\" pela aba Protocolos, e importar esse arquivo em outro aparelho ou compartilhar com outra pessoa que vá usar o mesmo formulário.",
              en: "Besides exporting the collected data, you can export the protocol's definition (name, sections, fields) as a \".json\" file from the Protocols tab, and import that file on another device or share it with someone else who will use the same form.",
              es: "Además de exportar los datos recolectados, puede exportar la definición del protocolo (nombre, secciones, campos) como un archivo \".json\" desde la pestaña Protocolos, e importar ese archivo en otro dispositivo o compartirlo con otra persona que vaya a usar el mismo formulario.",
              fr: "En plus d'exporter les données collectées, vous pouvez exporter la définition du protocole (nom, sections, champs) sous forme de fichier « .json » depuis l'onglet Protocoles, puis importer ce fichier sur un autre appareil ou le partager avec une autre personne qui utilisera le même formulaire.",
            },
          },
        ],
      },
    ],
  },
};
