/**
 * Küchler Formula Generator
 *
 * Applies the 5 rules from Küchler (1988) method to generate vegetation physiognomy formulas
 * and generates textual descriptions in multiple languages.
 */

import { classifyVegetation, type ContextFlag } from './vegetation_classifier';

// --- Language & Terminology Definitions ---

export type LangCode = "pt" | "en" | "es";

const TERMS = {
  pt: {
    // Text Connectors for Stratum Description
    stratum: "Estrato",
    with_cover: "com cobertura",
    no_veg: "Área sem vegetação descrita",
  },
  en: {
    stratum: "Stratum",
    with_cover: "with cover",
    no_veg: "No described vegetation",
  },
  es: {
    stratum: "Estrato",
    with_cover: "con cobertura",
    no_veg: "Área sin vegetación descrita",
  },
};

// --- Interfaces ---

interface MatrixData {
  matrix: Record<string, Record<string, string>>;
  leaf_matrix: Record<string, string>;
}

export interface KuchlerResult {
  raw_formula: string;
  kuchler_formula: string;
  total_strata: number;
  
  // Classification Data (System suggestion / Metadata)
  auto_physiognomy_name: string; 
  classification_group: string;  
  classification_type: string;   
  physiognomy_code?: string; 

  // Final Data (User decided/Edited)
  physiognomy_name: string; 
  
  description_text: string;
  strata_descriptions: StrataDescription[];
  matrix: Record<string, Record<string, string>>;
  leaf_matrix: Record<string, string>;
}

export interface StrataDescription {
  height_id: string;
  height_range: string;
  life_forms: {
    id: string;
    name: string;
    cover_id: string;
    cover_range: string;
    leaf_adaptation?: string;
  }[];
}

// --- Helper Functions for Text Generation ---

/**
 * Generates a detailed text description for a single stratum.
 * Example: "Stratum 8 (>35m): Deciduous Woody with cover Continuous."
 */
function generateStratumText(
  stratum: StrataDescription,
  lang: LangCode = "pt",
): string {
  const t = TERMS[lang] || TERMS["pt"];
  
  const range = stratum.height_range;

  const lifeFormsText = stratum.life_forms
    .map((lf) => {
      // Note: lf.name and lf.cover_range are already translated via the callback in processKuchlerMatrix
      const leafText = lf.leaf_adaptation ? ` (${lf.leaf_adaptation})` : "";
      return `${lf.name}${leafText} ${t.with_cover} ${lf.cover_range}`;
    })
    .join(`; `);

  return `${t.stratum} ${stratum.height_id} (${range}): ${lifeFormsText}.`;
}

// --- Main Logic Functions ---

/**
 * Apply Küchler method rules to generate final formula
 */
export function generateKuchlerFormula(
  matrixData: Record<string, Record<string, string>>,
  leafMatrixData: Record<string, string>,
  heightClasses: any[],
  config: any,
): string {
  const sortedHeights = heightClasses
    .map((h: any) => h.id)
    .sort((a: string, b: string) => Number(b) - Number(a));

  const lifeFormGroups: Record<string, { height: string; cover: string }[]> = {};

  sortedHeights.forEach((heightId) => {
    const heightRow = matrixData[heightId];
    if (heightRow && Object.keys(heightRow).length > 0) {
      Object.entries(heightRow).forEach(([lifeFormId, coverId]) => {
        if (!lifeFormGroups[lifeFormId]) {
          lifeFormGroups[lifeFormId] = [];
        }
        lifeFormGroups[lifeFormId].push({
          height: heightId,
          cover: coverId,
        });
      });
    }
  });

  Object.entries(lifeFormGroups).forEach(([lifeFormId, occurrences]) => {
    if (lifeFormId === "C" || lifeFormId === "X") {
      lifeFormGroups[lifeFormId] = [occurrences[0]];
    }
  });

  const formulaParts: string[] = [];

  Object.entries(lifeFormGroups).forEach(([lifeFormId, occurrences]) => {
    let part = lifeFormId;
    const highestHeight = occurrences[0].height;
    const leafAdaptation = leafMatrixData[highestHeight];
    if (leafAdaptation) {
      part += leafAdaptation;
    }

    if (occurrences.length > 1) {
      const allContinuous = occurrences.every((o) => o.cover === "c");
      const coverages = occurrences.map((o) => o.cover);
      const uniqueCoverages = new Set(coverages);

      if (allContinuous) {
        part += occurrences.map((o) => o.height).join("");
      } else if (uniqueCoverages.size === 1) {
        part += occurrences.map((o) => o.height).join("") + occurrences[0].cover;
      } else {
        occurrences.forEach((o) => {
          part += o.height + o.cover;
        });
      }
    } else {
      const occurrence = occurrences[0];
      part += occurrence.height;
      if (occurrence.cover !== "c") {
        part += occurrence.cover;
      }
    }
    formulaParts.push(part);
  });

  if (formulaParts.length > 1) {
    const hasNonContinuous = Object.values(lifeFormGroups).some((occurrences) =>
      occurrences.some((o) => o.cover !== "c"),
    );

    if (hasNonContinuous) {
      const rebuiltParts: string[] = [];
      Object.entries(lifeFormGroups).forEach(([lifeFormId, occurrences]) => {
        let part = lifeFormId;
        const highestHeight = occurrences[0].height;
        const leafAdaptation = leafMatrixData[highestHeight];
        if (leafAdaptation) part += leafAdaptation;

        if (occurrences.length > 1) {
          const allContinuous = occurrences.every((o) => o.cover === "c");
          if (allContinuous) {
            occurrences.forEach((o) => { part += o.height + "c"; });
          } else {
            occurrences.forEach((o) => { part += o.height + o.cover; });
          }
        } else {
          const occurrence = occurrences[0];
          part += occurrence.height + occurrence.cover;
        }
        rebuiltParts.push(part);
      });
      return rebuiltParts.join("");
    }
  }

  return formulaParts.join("");
}

/**
 * Generate complete Küchler data including formulas, descriptions and names.
 * Now uses the robust Vegetation Classifier for naming.
 */
export function processKuchlerMatrix(
  matrixDataJson: string,
  heightClasses: any[],
  coverClasses: any[],
  lifeForms: any,
  translateField: (field: any) => string,
  lang: LangCode = "pt", // Default language: Portuguese
  existingUserTitle?: string, // Optional: Preserves user edited title
  contextFlags: ContextFlag[] = [] // mangrove/spiny/semi-lignified, not derivable from the matrix alone
): KuchlerResult {
  const parsed: MatrixData = JSON.parse(matrixDataJson);
  const matrixData = parsed.matrix || {};
  const leafMatrixData = parsed.leaf_matrix || {};

  const sortedHeights = heightClasses
    .map((h: any) => h.id)
    .sort((a: string, b: string) => Number(b) - Number(a));

  // Build raw formula (simple representation of what was filled)
  // Needed for the Vegetation Classifier
  const rawFormulaParts: string[] = [];
  let totalStrata = 0;
  const strataDescriptions: StrataDescription[] = [];

  const allLifeForms = [
    ...(lifeForms.woody || []),
    ...(lifeForms.herbaceous || []),
    ...(lifeForms.special || []),
  ];

  sortedHeights.forEach((heightId: string) => {
    const heightRow = matrixData[heightId];
    if (heightRow && Object.keys(heightRow).length > 0) {
      totalStrata++;

      const leafAdaptation = leafMatrixData[heightId];

      // Build raw formula parts (e.g. "B7c,D7i")
      const parts = Object.entries(heightRow).map(([lifeFormId, coverId]) => {
        const leafPart = leafAdaptation ? leafAdaptation : "";
        return `${lifeFormId}${leafPart}${heightId}${coverId}`;
      });
      rawFormulaParts.push(parts.join(","));

      // Build strata description
      const heightClass = heightClasses.find((h: any) => h.id === heightId);
      const lifeFormsProcessed = Object.entries(heightRow).map(
        ([lifeFormId, coverId]) => {
          const lifeForm = allLifeForms.find((lf: any) => lf.id === lifeFormId);
          const coverClass = coverClasses.find((c: any) => c.id === coverId);
          return {
            id: lifeFormId,
            name: translateField(lifeForm?.name) || lifeFormId,
            cover_id: coverId as string,
            cover_range: translateField(coverClass?.label) || coverId,
            leaf_adaptation: leafAdaptation,
          };
        },
      );

      strataDescriptions.push({
        height_id: heightId,
        height_range: translateField(heightClass?.label) || heightId,
        life_forms: lifeFormsProcessed,
      });
    }
  });

  // Join strata with dot (e.g. "B7c,D7i.G2c")
  const rawFormula = rawFormulaParts.join(".");

  // Apply Küchler method rules to generate proper visual formula
  const kuchlerFormula = generateKuchlerFormula(
    matrixData,
    leafMatrixData,
    heightClasses,
    null,
  );

  // --- CLASSIFICATION LOGIC ---

  // 1. Classify vegetation based on raw formula and current language
  const classification = classifyVegetation(rawFormula, lang, contextFlags);

  // 2. Generate Translated Detailed Description (for each stratum)
  const fullDescription = strataDescriptions
    .map((stratum) => generateStratumText(stratum, lang))
    .join("\n");

  // 3. Define Final Name
  // If user has manually edited (and passed) a title, keep it.
  // Otherwise, use the auto-generated classification name.
  // If existingUserTitle is passed but empty string, it typically means user cleared it or system reset,
  // but if undefined, we assume full auto mode.
  const finalName = existingUserTitle !== undefined ? existingUserTitle : classification.name;

  return {
    raw_formula: rawFormula,
    kuchler_formula: kuchlerFormula,
    total_strata: totalStrata,
    
    // Auto-classification Data (Immutable suggestion)
    auto_physiognomy_name: classification.name,
    classification_group: classification.groupName,
    classification_type: classification.name, // Usually the Type Name is the main name
    physiognomy_code: classification.code,

    // Final Data (What shows up in the box, potentially edited)
    physiognomy_name: finalName,
    
    description_text: fullDescription,
    strata_descriptions: strataDescriptions,
    matrix: matrixData,
    leaf_matrix: leafMatrixData,
  };
}