import type { LocalizedString } from "@/protocol-kernel/types";

// Card titles/help text for the vegetation module's generic fields
// (homogeneity confirmation, conservation status + land use), which don't
// have a specialized *ModuleRenderer widget of their own the way the Kuchler
// matrix does. Ported from the legacy assets/protocols/paisageo/paisageo_protocol.json
// section titles/descriptions (Fase 2 of the plugin-architecture migration).

export const HOMOGENEITY_SECTION_TITLE: LocalizedString = {
  pt: "Verificação de Homogeneidade",
  en: "Homogeneity Check",
  es: "Verificación de Homogeneidad",
  fr: "Vérification d'Homogénéité",
};

export const CONSERVATION_SECTION_TITLE: LocalizedString = {
  pt: "Estado de Conservação da Vegetação",
  en: "Vegetation Conservation Status",
  es: "Estado de Conservación de la Vegetación",
  fr: "État de Conservation de la Végétation",
};

export const CONSERVATION_SECTION_DESC: LocalizedString = {
  pt: "Classificação macroscópica do estado de conservação da cobertura vegetal da parcela. A vegetação é um dos principais indicadores visuais da paisagem e de seu estado de conservação. Selecione a categoria que melhor descreve a situação observada em campo.",
  en: "Macroscopic classification of the vegetation cover conservation status in the plot. Vegetation is one of the main visual indicators of the landscape and its conservation state. Select the category that best describes the situation observed in the field.",
  es: "Clasificación macroscópica del estado de conservación de la cobertura vegetal de la parcela. La vegetación es uno de los principales indicadores visuales del paisaje y de su estado de conservación. Seleccione la categoría que mejor describe la situación observada en campo.",
  fr: "Classification macroscopique de l'état de conservation du couvert végétal de la parcelle. La végétation est l'un des principaux indicateurs visuels du paysage et de son état de conservation. Sélectionnez la catégorie qui décrit le mieux la situation observée sur le terrain.",
};

export const VEGETATION_STRUCTURE_SECTION_TITLE: LocalizedString = {
  pt: "Estrutura da Vegetação (Kuchler, 1988)",
  en: "Vegetation Structure (Kuchler, 1988)",
  es: "Estructura de la Vegetación (Kuchler, 1988)",
  fr: "Structure de la Végétation (Küchler, 1988)",
};

export const PHYSIOGNOMY_COMPLEMENT_DESC: LocalizedString = {
  pt: "Campo de texto livre. A fisionomia acima é calculada automaticamente a partir da matriz (e dos sinalizadores de contexto, quando marcados) — use este campo só para registrar observações que esse cálculo não captura, como a dominância de alguma espécie ou gênero vegetal, uma nota sobre um estrato incomum, um limite impreciso entre fisionomias, ou qualquer detalhe relevante para interpretar a classificação depois. Não altera o tipo classificado.",
  en: "Free-text field. The physiognomy above is computed automatically from the matrix (and from context flags, when marked) — use this field only to record observations that computation doesn't capture, such as the dominance of a plant species or genus, a note about an unusual stratum, an imprecise boundary between physiognomies, or any detail relevant to interpreting the classification later. It does not change the classified type.",
  es: "Campo de texto libre. La fisionomía anterior se calcula automáticamente a partir de la matriz (y de los indicadores de contexto, cuando están marcados) — use este campo solo para registrar observaciones que ese cálculo no captura, como la dominancia de alguna especie o género vegetal, una nota sobre un estrato inusual, un límite impreciso entre fisionomías, o cualquier detalle relevante para interpretar la clasificación después. No altera el tipo clasificado.",
  fr: "Champ de texte libre. La physionomie ci-dessus est calculée automatiquement à partir de la matrice (et des indicateurs de contexte, lorsqu'ils sont cochés) — utilisez ce champ uniquement pour noter des observations que ce calcul ne capture pas, comme la dominance d'une espèce ou d'un genre végétal, une remarque sur une strate inhabituelle, une limite imprécise entre physionomies, ou tout détail utile pour interpréter la classification plus tard. Cela ne modifie pas le type classifié.",
};
