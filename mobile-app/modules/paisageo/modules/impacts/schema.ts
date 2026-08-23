import type { FieldSchema, ModuleSchema } from "@/protocol-kernel/types";

export const impactsItemFields: FieldSchema[] = [
  {
    id: "type",
    label: { pt: "Tipo de Impacto", en: "Impact Type", es: "Tipo de Impacto", fr: "Type d'Impact" },
    type: "select",
    options: [
      {
        value: "pollution",
        label: { pt: "Poluição", en: "Pollution", es: "Contaminación", fr: "Pollution" },
        desc: { pt: "Contaminação do solo, água ou ar por resíduos, químicos ou dejetos", en: "Contamination of soil, water or air by waste, chemicals or effluents", es: "Contaminación del suelo, agua o aire por residuos, químicos o efluentes", fr: "Contamination du sol, de l'eau ou de l'air par des déchets, des produits chimiques ou des effluents" },
      },
      {
        value: "erosion",
        label: { pt: "Erosão", en: "Erosion", es: "Erosión", fr: "Érosion" },
        desc: { pt: "Perda de solo por ação da água, vento ou gravidade; formação de sulcos e ravinas", en: "Soil loss by water, wind or gravity action; formation of gullies and ravines", es: "Pérdida de suelo por acción del agua, viento o gravedad; formación de surcos y cárcavas", fr: "Perte de sol par l'action de l'eau, du vent ou de la gravité ; formation de ravines et de ravinements" },
      },
      {
        value: "invasive_species",
        label: { pt: "Espécies invasoras", en: "Invasive species", es: "Especies invasoras", fr: "Espèces invasives" },
        desc: { pt: "Presença de espécies exóticas que competem e ameaçam a vegetação nativa", en: "Presence of exotic species that compete with and threaten native vegetation", es: "Presencia de especies exóticas que compiten y amenazan la vegetación nativa", fr: "Présence d'espèces exotiques qui concurrencent et menacent la végétation native" },
      },
      {
        value: "fire",
        label: { pt: "Fogo", en: "Fire", es: "Fuego", fr: "Feu" },
        desc: { pt: "Queimadas recentes ou antigas; evidências de incêndios florestais", en: "Recent or old burns; evidence of forest fires", es: "Quemas recientes o antiguas; evidencias de incendios forestales", fr: "Brûlages récents ou anciens ; traces d'incendies de forêt" },
      },
      {
        value: "frost",
        label: { pt: "Geada", en: "Frost", es: "Helada", fr: "Gel" },
        desc: { pt: "Danos à vegetação causados por temperaturas abaixo de zero", en: "Damage to vegetation caused by below-zero temperatures", es: "Daños a la vegetación causados por temperaturas bajo cero", fr: "Dommages à la végétation causés par des températures inférieures à zéro" },
      },
      {
        value: "mining",
        label: { pt: "Mineração", en: "Mining", es: "Minería", fr: "Extraction Minière" },
        desc: { pt: "Extração de minerais; áreas degradadas por atividade mineral ou de exploração", en: "Mineral extraction; areas degraded by mining or exploration activities", es: "Extracción de minerales; áreas degradadas por actividad minera o de explotación", fr: "Extraction de minéraux ; zones dégradées par des activités d'extraction ou d'exploration minière" },
      },
      {
        value: "drought",
        label: { pt: "Seca", en: "Drought", es: "Sequía", fr: "Sécheresse" },
        desc: { pt: "Estresse hídrico prolongado; sinais de déficit de água na vegetação", en: "Prolonged water stress; signs of water deficit in vegetation", es: "Estrés hídrico prolongado; signos de déficit de agua en la vegetación", fr: "Stress hydrique prolongé ; signes de déficit hydrique dans la végétation" },
      },
      {
        value: "overgrazing",
        label: { pt: "Sobrepastoreio", en: "Overgrazing", es: "Sobrepastoreo", fr: "Surpâturage" },
        desc: { pt: "Danos por pastagem excessiva de animais; compactação e perda de cobertura vegetal", en: "Damage from excessive animal grazing; compaction and loss of vegetation cover", es: "Daños por pastoreo excesivo de animales; compactación y pérdida de cobertura vegetal", fr: "Dommages dus au surpâturage animal ; compaction et perte du couvert végétal" },
      },
      {
        value: "burial",
        label: { pt: "Soterramento", en: "Burial", es: "Enterramiento", fr: "Enfouissement" },
        desc: { pt: "Deposição excessiva de sedimentos sobre a vegetação; assoreamento", en: "Excessive sediment deposition over vegetation; sedimentation", es: "Deposición excesiva de sedimentos sobre la vegetación; sedimentación", fr: "Dépôt excessif de sédiments sur la végétation ; sédimentation" },
      },
      {
        value: "vegetation_removal",
        label: { pt: "Supressão vegetal", en: "Vegetation removal", es: "Supresión vegetal", fr: "Suppression végétale" },
        desc: { pt: "Remoção ou corte intencional da vegetação; desmatamento e limpeza de terreno", en: "Intentional removal or cutting of vegetation; deforestation and land clearing", es: "Remoción o corte intencional de la vegetación; deforestación y limpieza de terreno", fr: "Enlèvement ou coupe intentionnelle de la végétation ; déforestation et défrichement" },
      },
    ],
  },
  {
    id: "magnitude",
    label: { pt: "Magnitude", en: "Magnitude", es: "Magnitud", fr: "Magnitude" },
    type: "select",
    options: [
      { value: "occasional", label: { pt: "Ocasional", en: "Occasional", es: "Ocasional", fr: "Occasionnel" } },
      { value: "common",     label: { pt: "Comum",     en: "Common",     es: "Común",     fr: "Courant"      } },
      { value: "critical",   label: { pt: "Crítico",   en: "Critical",   es: "Crítico",   fr: "Critique"     } },
    ],
  },
  {
    id: "details",
    label: { pt: "Detalhes", en: "Details", es: "Detalles", fr: "Détails" },
    type: "text",
  },
];

export const impactsSchema: ModuleSchema = {
  fields: [],
  dynamic: [
    {
      groupId: "impacts",
      itemFields: impactsItemFields,
      columnNamePattern: "impact_{i}_{field}",
    },
  ],
};
