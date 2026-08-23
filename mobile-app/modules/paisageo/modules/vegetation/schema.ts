import type { ModuleSchema, FieldSchema, SelectOption } from "@/protocol-kernel/types";

const conservationStatusOptions: SelectOption[] = [
  {
    value: "conservada",
    label: { pt: "Conservada", en: "Conserved", es: "Conservada", fr: "Conservée" },
    desc: { pt: "Vegetação nativa com estrutura e composição características do tipo fisionômico local, sem sinais evidentes de perturbação antrópica recente.", en: "Native vegetation with structure and composition characteristic of the local physiognomic type, with no evident signs of recent human disturbance.", es: "Vegetación nativa con estructura y composición características del tipo fisionómico local, sin señales evidentes de perturbación antrópica reciente.", fr: "Végétation native avec une structure et une composition caractéristiques du type physionomique local, sans signes évidents de perturbation anthropique récente." },
  },
  {
    value: "em_regeneracao_nativas",
    label: { pt: "Em Regeneração — Nativas", en: "In Regeneration — Natives", es: "En Regeneración — Nativas", fr: "En Régénération — Natives" },
    desc: { pt: "Vegetação em processo de regeneração natural composta predominantemente por espécies nativas. Evidencia-se pela presença de capoeira, capoeirinha ou vegetação secundária em estágio inicial ou médio, sem domínio de espécies invasoras.", en: "Vegetation in natural regeneration process composed predominantly of native species. Evidenced by the presence of secondary vegetation in early or intermediate stage, without dominance of invasive species.", es: "Vegetación en proceso de regeneración natural compuesta predominantemente por especies nativas. Se evidencia por la presencia de vegetación secundaria en etapa inicial o media, sin dominio de especies invasoras.", fr: "Végétation en processus de régénération naturelle composée principalement d'espèces natives. Mise en évidence par la présence de végétation secondaire en stade initial ou intermédiaire, sans dominance d'espèces invasives." },
  },
  {
    value: "em_regeneracao_consorciada",
    label: { pt: "Em Regeneração — Consorciada com Invasoras", en: "In Regeneration — Native-Invasive Mix", es: "En Regeneración — Consorciada con Invasoras", fr: "En Régénération — Mixte Natives-Invasives" },
    desc: { pt: "Vegetação em regeneração com presença significativa de espécies exóticas invasoras (ex.: braquiária, capim-gordura, leucena, pinus). As espécies nativas estão presentes, mas a regeneração é comprometida pela competição com invasoras.", en: "Regenerating vegetation with significant presence of exotic invasive species (e.g.: Urochloa, molasses grass, leucaena, pinus). Native species are present, but regeneration is compromised by competition with invasives.", es: "Vegetación en regeneración con presencia significativa de especies exóticas invasoras (ej.: braquiaria, pasto gordura, leucena, pinus). Las especies nativas están presentes, pero la regeneración es comprometida por la competencia con invasoras.", fr: "Végétation en régénération avec présence significative d'espèces exotiques invasives (ex. : Urochloa, herbe à mélasse, leucène, pin). Les espèces natives sont présentes, mais la régénération est compromise par la concurrence avec les invasives." },
  },
  {
    value: "substituida",
    label: { pt: "Substituída", en: "Substituted", es: "Sustituida", fr: "Substituée" },
    desc: { pt: "Vegetação nativa original completamente substituída por outro uso da terra. Se selecionada, indique o tipo de uso da terra no campo seguinte.", en: "Original native vegetation completely replaced by another land use. If selected, indicate the land use type in the following field.", es: "Vegetación nativa original completamente sustituida por otro uso de la tierra. Si se selecciona, indique el tipo de uso de la tierra en el siguiente campo.", fr: "Végétation native originale complètement remplacée par un autre usage du sol. Si sélectionné, indiquez le type d'utilisation du sol dans le champ suivant." },
  },
];

const landUseOptions: SelectOption[] = [
  {
    value: "cultivo_temporario",
    label: { pt: "Cultivo Temporário", en: "Temporary Crops", es: "Cultivo Temporal", fr: "Cultures Temporaires" },
    desc: { pt: "Áreas com culturas de ciclo curto colhidas e replantadas periodicamente (ex.: milho, soja, arroz, feijão, hortaliças).", en: "Areas with short-cycle crops harvested and replanted periodically (e.g.: corn, soybean, rice, beans, vegetables).", es: "Áreas con cultivos de ciclo corto cosechados y replantados periódicamente (ej.: maíz, soja, arroz, frijol, hortalizas).", fr: "Zones de cultures à cycle court, récoltées et replantées périodiquement (ex. : maïs, soja, riz, haricots, légumes)." },
  },
  {
    value: "cultivo_permanente",
    label: { pt: "Cultivo Permanente", en: "Permanent Crops", es: "Cultivo Permanente", fr: "Cultures Permanentes" },
    desc: { pt: "Culturas de longa duração sem necessidade de replantio após cada colheita (ex.: café, cacau, citros, banana, seringueira).", en: "Long-duration crops that do not require replanting after each harvest (e.g.: coffee, cocoa, citrus, banana, rubber tree).", es: "Cultivos de larga duración que no requieren replantación después de cada cosecha (ej.: café, cacao, cítricos, banana, caucho).", fr: "Cultures de longue durée ne nécessitant pas de replantation après chaque récolte (ex. : café, cacao, agrumes, banane, hévéa)." },
  },
  {
    value: "pasto_plantado",
    label: { pt: "Pasto Plantado", en: "Planted Pasture", es: "Pasto Plantado", fr: "Pâturage Planté" },
    desc: { pt: "Gramíneas forrageiras implantadas intencionalmente para suporte de rebanhos (ex.: braquiária, capim-mombaça, tifton).", en: "Forage grasses intentionally planted to support livestock (e.g.: Urochloa, mombaça grass, tifton).", es: "Gramíneas forrajeras implantadas intencionalmente para sustentar rebaños (ej.: braquiaria, pasto mombaça, tifton).", fr: "Graminées fourragères plantées intentionnellement pour soutenir le bétail (ex. : Urochloa, herbe mombaça, tifton)." },
  },
  {
    value: "agrofloresta",
    label: { pt: "Agrofloresta", en: "Agroforestry", es: "Agrosilvicultura", fr: "Agroforesterie" },
    desc: { pt: "Sistema que combina espécies lenhosas perenes com cultivos agrícolas e/ou animais na mesma área.", en: "System combining perennial woody species with agricultural crops and/or animals in the same area.", es: "Sistema que combina especies leñosas perennes con cultivos agrícolas y/o animales en la misma área.", fr: "Système combinant des espèces ligneuses pérennes avec des cultures agricoles et/ou des animaux dans la même zone." },
  },
  {
    value: "silvicultura",
    label: { pt: "Silvicultura", en: "Silviculture", es: "Silvicultura", fr: "Sylviculture" },
    desc: { pt: "Plantação florestal para fins madeireiros ou celulose em arranjo monoespecífico (ex.: eucalipto, pinus, teca).", en: "Forest plantation for timber or pulp in monospecific arrangement (e.g.: eucalyptus, pine, teak).", es: "Plantación forestal con fines madereros o celulosa en arreglo monoespecífico (ej.: eucalipto, pino, teca).", fr: "Plantation forestière à des fins de bois d'œuvre ou de pâte à papier en arrangement monospécifique (ex. : eucalyptus, pin, teck)." },
  },
  {
    value: "construcoes",
    label: { pt: "Construções/Infraestrutura", en: "Buildings/Infrastructure", es: "Construcciones/Infraestructura", fr: "Constructions/Infrastructures" },
    desc: { pt: "Edificações, vias, pavimentação ou infraestruturas que suprimiram totalmente a cobertura vegetal.", en: "Buildings, roads, paving or infrastructure that totally suppressed vegetation cover.", es: "Edificaciones, vías, pavimentación o infraestructuras que suprimieron totalmente la cobertura vegetal.", fr: "Bâtiments, routes, pavage ou infrastructures ayant totalement supprimé le couvert végétal." },
  },
  {
    value: "solo_exposto",
    label: { pt: "Solo Exposto", en: "Bare Soil", es: "Suelo Expuesto", fr: "Sol Nu" },
    desc: { pt: "Área sem cobertura vegetal com solo diretamente exposto por ação antrópica (terraplanagem, mineração, preparo de solo).", en: "Area without vegetation cover with soil directly exposed by human action (earthmoving, mining, soil preparation).", es: "Área sin cobertura vegetal con suelo directamente expuesto por acción antrópica (movimiento de tierras, minería, preparación del suelo).", fr: "Zone sans couvert végétal avec le sol directement exposé par action anthropique (terrassement, extraction minière, préparation du sol)." },
  },
];

/** Fields of ONE vegetation stratum - used both in the schema and in the tests. */
export const vegetationStrataItemFields: FieldSchema[] = [
  {
    id: "height_id",
    label: { pt: "Código de altura",      en: "Height ID",       es: "Código de altura",     fr: "Code de hauteur" },
    type: "text",
  },
  {
    id: "height_range",
    label: { pt: "Amplitude de altura",  en: "Height range",    es: "Amplitud de altura",   fr: "Amplitude de hauteur" },
    type: "text",
  },
  {
    id: "life_form",
    label: { pt: "Formas de vida",        en: "Life forms",      es: "Formas de vida",       fr: "Formes de vie" },
    type: "text",
  },
  {
    id: "cover_class",
    label: { pt: "Classes de cobertura",  en: "Cover classes",   es: "Clases de cobertura",  fr: "Classes de couverture" },
    type: "text",
  },
  {
    id: "leaf_adaptation",
    label: { pt: "Adaptações foliares",   en: "Leaf adaptations", es: "Adaptaciones foliares", fr: "Adaptations foliaires" },
    type: "text",
  },
];

export const vegetationSchema: ModuleSchema = {
  fields: [
    // --- Formula data (exportable) ---
    {
      id: "raw_formula",
      label: { pt: "Fórmula bruta",       en: "Raw formula",       es: "Fórmula bruta",      fr: "Formule brute" },
      type: "text",
    },
    {
      id: "kuchler_formula",
      label: { pt: "Fórmula de Kuchler",  en: "Kuchler formula",   es: "Fórmula de Kuchler", fr: "Formule de Küchler" },
      type: "text",
    },
    {
      id: "total_strata",
      label: { pt: "Total de estratos",   en: "Total strata",      es: "Total de estratos",  fr: "Total de strates" },
      type: "number",
    },
    {
      id: "physiognomy_name",
      label: { pt: "Nome da fisionomia",  en: "Physiognomy name",  es: "Nombre de fisonomía", fr: "Nom de la physionomie" },
      type: "text",
    },
    {
      id: "classification_group",
      label: { pt: "Grupo de classificação", en: "Classification group", es: "Grupo de clasificación", fr: "Groupe de classification" },
      type: "text",
    },
    {
      id: "classification_type",
      label: { pt: "Tipo de classificação",  en: "Classification type",  es: "Tipo de clasificación",  fr: "Type de classification" },
      type: "text",
    },
    {
      id: "description_text",
      label: { pt: "Descrição textual",   en: "Text description",  es: "Descripción textual", fr: "Description textuelle" },
      type: "text",
    },

    // --- Conservation status (exportable) ---
    {
      id: "conservation_status",
      label: { pt: "Estado de conservação", en: "Conservation status", es: "Estado de conservación", fr: "État de conservation" },
      type: "select",
      layout: "single_column",
      hideLabel: true,
      options: conservationStatusOptions,
    },
    {
      id: "land_use",
      label: { pt: "Uso do solo",          en: "Land use",           es: "Uso del suelo",          fr: "Utilisation du sol" },
      type: "select",
      options: landUseOptions,
    },
    {
      id: "homogeneity_check",
      label: { pt: "Confirmação de homogeneidade", en: "Homogeneity confirmation", es: "Confirmación de homogeneidad", fr: "Confirmation d'homogénéité" },
      type: "boolean",
      required: true,
      renderAs: "confirm_checkbox",
      description: { pt: "A homogeneidade é o pressuposto fundamental da unidade de paisagem: cada ponto de coleta deve representar um segmento internamente uniforme em termos de vegetação, solo e relevo, na escala de observação adotada. Se a área observada combinar elementos heterogêneos (por exemplo, transição abrupta de vegetação ou relevo), os dados coletados não representam corretamente uma única unidade de paisagem, comprometendo comparações e classificações posteriores. Antes de prosseguir, verifique se o ponto e seu entorno imediato mantêm essa homogeneidade.", en: "Homogeneity is the fundamental assumption of the landscape unit: each collection point must represent an internally uniform segment in terms of vegetation, soil, and relief, at the observation scale adopted. If the observed area combines heterogeneous elements (for example, an abrupt transition in vegetation or relief), the collected data does not correctly represent a single landscape unit, compromising later comparisons and classifications. Before proceeding, verify that the point and its immediate surroundings maintain this homogeneity.", es: "La homogeneidad es el supuesto fundamental de la unidad de paisaje: cada punto de recolección debe representar un segmento internamente uniforme en términos de vegetación, suelo y relieve, en la escala de observación adoptada. Si el área observada combina elementos heterogéneos (por ejemplo, una transición abrupta de vegetación o relieve), los datos recolectados no representan correctamente una única unidad de paisaje, comprometiendo comparaciones y clasificaciones posteriores. Antes de continuar, verifique que el punto y su entorno inmediato mantengan esa homogeneidad.", fr: "L'homogénéité est le postulat fondamental de l'unité de paysage : chaque point de collecte doit représenter un segment intérieurement uniforme en termes de végétation, de sol et de relief, à l'échelle d'observation adoptée. Si la zone observée combine des éléments hétérogènes (par exemple, une transition abrupte de végétation ou de relief), les données collectées ne représentent pas correctement une seule unité de paysage, ce qui compromet les comparaisons et classifications ultérieures. Avant de continuer, vérifiez que le point et ses environs immédiats maintiennent cette homogénéité." },
    },

    // --- Context flags (don't derive from the raw formula alone,
    // see ContextFlag in services/vegetation_classifier.ts) ---
    {
      id: "context_flags",
      label: { pt: "Sinalizadores de contexto", en: "Context flags", es: "Indicadores de contexto", fr: "Indicateurs de contexte" },
      type: "multiselect",
      renderAs: "checkbox",
      description: { pt: "Marque só quando aplicável. A matriz de Küchler, sozinha, não distingue certas fisionomias especiais — esses sinalizadores complementam a leitura da matriz e substituem ou refinam o tipo que ela calcularia. Toque no ícone \"i\" de cada opção para ver exatamente qual tipo fitofisionômico cada sinalizador destrava.", en: "Only mark when applicable. The Küchler matrix alone cannot distinguish certain special physiognomies — these flags complement the matrix reading and replace or refine the type it would otherwise compute. Tap the \"i\" icon on each option to see exactly which physiognomic type each flag unlocks.", es: "Marque solo cuando corresponda. La matriz de Küchler, por sí sola, no distingue ciertas fisionomías especiales — estos indicadores complementan la lectura de la matriz y sustituyen o refinan el tipo que ella calcularía. Toque el ícono \"i\" de cada opción para ver exactamente qué tipo fitofisionómico destraba cada indicador.", fr: "Ne cochez que si applicable. La matrice de Küchler, seule, ne distingue pas certaines physionomies particulières — ces indicateurs complètent la lecture de la matrice et remplacent ou affinent le type qu'elle calculerait. Touchez l'icône « i » de chaque option pour voir exactement quel type physionomique chaque indicateur débloque." },
      options: [
        {
          value: "mangrove",
          label: { pt: "Manguezal", en: "Mangrove", es: "Manglar", fr: "Mangrove" },
          desc: { pt: "A unidade observada é um bosque de mangue. Só tem efeito quando altura e cobertura já classificam a unidade no grupo C1 (Floresta Densa); dentro desse grupo, força o tipo C1_T05 (Bosque de mangue), substituindo a forma de vida dominante que a matriz indicaria.", en: "The observed unit is a mangrove forest. Only takes effect when height and cover already classify the unit into group C1 (Dense Forest); within that group, it forces type C1_T05 (Mangrove forest), overriding the dominant life form the matrix would otherwise indicate.", es: "La unidad observada es un bosque de manglar. Solo tiene efecto cuando la altura y la cobertura ya clasifican la unidad en el grupo C1 (Bosque Denso); dentro de ese grupo, fuerza el tipo C1_T05 (Bosque de manglar), sustituyendo la forma de vida dominante que la matriz indicaría.", fr: "L'unité observée est une forêt de mangrove. N'a d'effet que lorsque la hauteur et le recouvrement classent déjà l'unité dans le groupe C1 (Forêt dense) ; dans ce groupe, il impose le type C1_T05 (Forêt de mangrove), remplaçant la forme de vie dominante que la matrice indiquerait." },
        },
        {
          value: "spiny",
          label: { pt: "Espinhosa", en: "Spiny", es: "Espinosa", fr: "Épineuse" },
          desc: { pt: "A vegetação lenhosa decídua dominante é predominantemente espinhosa. Só afeta a classificação quando a forma de vida dominante é Lenhosa Decídua (D): força o tipo C1_T13 (Floresta espinhosa densa) se a unidade cair no grupo C1, ou C2_T12 (Floresta espinhosa aberta) se cair no grupo C2. Sem efeito para qualquer outra forma de vida dominante.", en: "The dominant deciduous woody vegetation is predominantly spiny. Only affects classification when the dominant life form is Deciduous Woody (D): it forces type C1_T13 (Thorn closed forest) if the unit falls in group C1, or C2_T12 (Thorn open forest) if it falls in group C2. No effect for any other dominant life form.", es: "La vegetación leñosa decidua dominante es predominantemente espinosa. Solo afecta la clasificación cuando la forma de vida dominante es Leñosa Decidua (D): fuerza el tipo C1_T13 (Bosque denso espinoso) si la unidad cae en el grupo C1, o C2_T12 (Bosque abierto espinoso) si cae en el grupo C2. Sin efecto para cualquier otra forma de vida dominante.", fr: "La végétation ligneuse décidue dominante est majoritairement épineuse. N'affecte la classification que lorsque la forme de vie dominante est Ligneuse Décidue (D) : elle impose le type C1_T13 (Forêt dense épineuse) si l'unité relève du groupe C1, ou C2_T12 (Forêt claire épineuse) si elle relève du groupe C2. Sans effet pour toute autre forme de vie dominante." },
        },
        {
          value: "semi-lignified",
          label: { pt: "Subarbustiva", en: "Semi-lignified", es: "Subarbustiva", fr: "Semi-lignifiée" },
          desc: { pt: "A vegetação é predominantemente subarbustiva (base lenhosa, porte herbáceo). Ignora a forma de vida dominante indicada pela matriz: força o tipo C3_T04 (Subarbustal sempreverde denso) quando a cobertura observada é Contínua, ou C3_T16 (Subarbustal sempreverde aberto) caso contrário.", en: "The vegetation is predominantly subshrubby (woody base, herbaceous stature). Ignores the dominant life form the matrix would otherwise indicate: it forces type C3_T04 (Evergreen suffruticose thicket) when the observed cover is Continuous, or C3_T16 (Evergreen suffruticose shrubland) otherwise.", es: "La vegetación es predominantemente subarbustiva (base leñosa, porte herbáceo). Ignora la forma de vida dominante que la matriz indicaría: fuerza el tipo C3_T04 (Matorral denso sufruticoso siempreverde) cuando la cobertura observada es Continua, o C3_T16 (Matorral abierto sufruticoso siempreverde) en caso contrario.", fr: "La végétation est majoritairement subarbustive (base ligneuse, port herbacé). Ignore la forme de vie dominante que la matrice indiquerait : elle impose le type C3_T04 (Fourrés sempervirents suffrutescents) lorsque le recouvrement observé est Continu, ou C3_T16 (Buissons sempervirents suffrutescents) sinon." },
        },
      ],
    },

    // --- KuchlerMatrix internal state (not exportable) ---
    {
      id: "matrix",
      label: { pt: "Matriz (interno)",     en: "Matrix (internal)", es: "Matriz (interno)",    fr: "Matrice (interne)" },
      type: "text",
      exportable: false,
    },
    {
      id: "leaf_matrix",
      label: { pt: "Matriz foliar (interno)", en: "Leaf matrix (internal)", es: "Matriz foliar (interno)", fr: "Matrice foliaire (interne)" },
      type: "text",
      exportable: false,
    },
  ],

  dynamic: [
    {
      groupId: "vegetation_strata",
      itemFields: vegetationStrataItemFields,
      columnNamePattern: "veg_stratum_{i}_{field}",
    },
  ],
};
