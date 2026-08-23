// src/utils/landscape-naming.ts

import { geomorphologyTypeOptions } from "@/modules/paisageo/modules/geoecological-constraints/schema";

/**
 * Landscape Name Generator
 *
 * Generates a synthetic name for the landscape based on collected attributes,
 * following the logic: [Vegetation] on [Environment], influenced by [Main Impacts].
 *
 * Includes advanced grammatical gender and number agreement (masculine/feminine, singular/plural) 
 * for Romance languages (Portuguese and Spanish) to ensure natural language generation.
 */

// --- Types ---

export type LangCode = "pt" | "en" | "es" | "fr";
export type GrammaticalGender = "m" | "f" | "mp" | "fp"; // Masculine, Feminine, Masc. Plural, Fem. Plural

export interface LandscapeDataInput {
  veg_structure?: string;        // JSON String from Kuchler Matrix
  veg_physiognomy_name?: string; // Pre-processed vegetation name (already localized)
  veg_physiognomy_complement?: string; // Additional details about physiognomy
  geomorphology_type?: string | string[]; // JSON String or Array of strings
  environmental_impacts?: string; // JSON String
}

// --- Dictionaries & Mappings ---

// General sentence connectors
const TERMS: Record<string, any> = {
  pt: {
    on_env: " sobre ambiente ",
    // Dynamic connector based on vegetation gender/number
    influenced_by: (gender: GrammaticalGender) => {
      if (gender === 'fp') return ", influenciadas por ";
      if (gender === 'mp') return ", influenciados por ";
      if (gender === 'f') return ", influenciada por ";
      return ", influenciado por "; // Default masculine
    },
    and: " e ",
    not_classified: "Vegetação não classificada",
    not_classified_gender: "f" as GrammaticalGender,
    undefined: "Paisagem Indefinida",
  },
  en: {
    on_env: " on environment ",
    influenced_by: () => ", influenced by ", // English is gender-neutral
    and: " and ",
    not_classified: "Unclassified vegetation",
    not_classified_gender: "m" as GrammaticalGender, // unused: English has no gender agreement
    undefined: "Undefined Landscape",
  },
  es: {
    on_env: " sobre ambiente ",
    // Dynamic connector based on vegetation gender/number
    influenced_by: (gender: GrammaticalGender) => {
      if (gender === 'fp') return ", influenciadas por ";
      if (gender === 'mp') return ", influenciados por ";
      if (gender === 'f') return ", influenciada por ";
      return ", influenciado por "; // Default masculine
    },
    and: " y ",
    not_classified: "Vegetación no clasificada",
    not_classified_gender: "f" as GrammaticalGender,
    undefined: "Paisaje Indefinido",
  },
  fr: {
    on_env: " sur environnement ",
    // Dynamic connector based on vegetation gender/number
    influenced_by: (gender: GrammaticalGender) => {
      if (gender === 'fp') return ", influencées par ";
      if (gender === 'mp') return ", influencés par ";
      if (gender === 'f') return ", influencée par ";
      return ", influencé par "; // Default masculine
    },
    and: " et ",
    not_classified: "Végétation non classifiée",
    not_classified_gender: "f" as GrammaticalGender,
    undefined: "Paysage Indéfini",
  },
};

// Impact translation and intrinsic grammatical gender mapping (based on PT/ES/FR grammar)
interface ImpactDef {
  pt: string; en: string; es: string; fr: string;
  gender: GrammaticalGender;
  // Per-language override for the rare case where grammatical gender disagrees
  // between languages for the same concept (e.g. "frost": feminine in pt/es
  // — "geada"/"helada" — but masculine in fr — "le gel"). Keys not present
  // here fall back to `gender`.
  genderByLang?: Partial<Record<LangCode, GrammaticalGender>>;
}

const IMPACT_TRANSLATIONS: Record<string, ImpactDef> = {
  "pollution": { pt: "poluição", en: "pollution", es: "contaminación", fr: "pollution", gender: "f" },
  "erosion": { pt: "erosão", en: "erosion", es: "erosión", fr: "érosion", gender: "f" },
  "invasive_species": { pt: "espécies invasoras", en: "invasive species", es: "especies invasoras", fr: "espèces invasives", gender: "fp" },
  "fire": { pt: "fogo", en: "fire", es: "fuego", fr: "feu", gender: "m" },
  "frost": { pt: "geada", en: "frost", es: "helada", fr: "gel", gender: "f", genderByLang: { fr: "m" } },
  "mining": { pt: "mineração", en: "mining", es: "minería", fr: "exploitation minière", gender: "f" },
  "drought": { pt: "seca", en: "drought", es: "sequía", fr: "sécheresse", gender: "f" },
  "overgrazing": { pt: "sobrepastoreio", en: "overgrazing", es: "sobrepastoreo", fr: "surpâturage", gender: "m" },
  "burial": { pt: "soterramento", en: "burial", es: "enterramiento", fr: "ensevelissement", gender: "m" },
  "vegetation_removal": { pt: "supressão vegetal", en: "vegetation removal", es: "supresión vegetal", fr: "suppression végétale", gender: "f" },
};

// Adjective inflection dictionary by language, weight, and gender
const ADJECTIVES: Record<string, Record<number, Record<GrammaticalGender, string>>> = {
  pt: {
    3: { m: "severo", f: "severa", mp: "severos", fp: "severas" },
    2: { m: "moderado", f: "moderada", mp: "moderados", fp: "moderadas" },
    1: { m: "leve", f: "leve", mp: "leves", fp: "leves" },
  },
  es: {
    3: { m: "severo", f: "severa", mp: "severos", fp: "severas" },
    2: { m: "moderado", f: "moderada", mp: "moderados", fp: "moderadas" },
    1: { m: "leve", f: "leve", mp: "leves", fp: "leves" }, 
  },
  en: {
    3: { m: "severe", f: "severe", mp: "severe", fp: "severe" },
    2: { m: "moderate", f: "moderate", mp: "moderate", fp: "moderate" },
    1: { m: "light", f: "light", mp: "light", fp: "light" },
  },
  fr: {
    3: { m: "sévère", f: "sévère", mp: "sévères", fp: "sévères" },
    2: { m: "modéré", f: "modérée", mp: "modérés", fp: "modérées" },
    1: { m: "léger", f: "légère", mp: "légers", fp: "légères" },
  }
};

// --- Helpers ---

const safeParse = (jsonString?: string | null) => {
  if (!jsonString) return null;
  try { return JSON.parse(jsonString); } catch { return null; }
};

const getMagnitudeWeight = (magnitude: string): number => {
  if (!magnitude) return 0;
  const normalized = magnitude.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (normalized.includes("crit") || normalized.includes("sever")) return 3;
  if (normalized.includes("comum") || normalized.includes("common") || normalized.includes("comun") || normalized.includes("moderat") || normalized.includes("med")) return 2;
  if (normalized.includes("ocas") || normalized.includes("occ") || normalized.includes("light") || normalized.includes("leve")) return 1;
  return 0;
};

const getSafeLang = (lang?: string | null): string => {
  const normalizedLang = lang ? lang.split('-')[0].toLowerCase() : 'pt';
  return TERMS[normalizedLang] ? normalizedLang : 'pt';
};

// Known placeholder/sentinel strings for "vegetation not classified" across all 4
// supported languages (legacy data may carry any of these regardless of the
// current display language). Centralized so the gender lookup and the
// text-substitution decision below never disagree.
const UNCLASSIFIED_VEG_PLACEHOLDERS = ["Não Classificado", "Not Classified", "No Clasificado", "Végétation non classifiée"];
const isUnclassifiedVegName = (vegName?: string): boolean =>
  !vegName || UNCLASSIFIED_VEG_PLACEHOLDERS.includes(vegName);

/**
 * Determines the grammatical gender and number of the vegetation string based on its first word.
 * Essential for PT/ES ("Floresta influenciada" vs "Bosque influenciado" vs "Comunidades influenciadas").
 * `fallbackGender` is used when vegName is empty or a "not classified" placeholder — in that case
 * the sentence actually renders `t.not_classified`, so gender must match that phrase's own gender.
 */
const getVegetationGender = (vegName: string, fallbackGender: GrammaticalGender): GrammaticalGender => {
  if (isUnclassifiedVegName(vegName)) return fallbackGender;

  // Normalize the first word (lowercase, remove accents)
  const firstWord = vegName.trim().split(" ")[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  // Feminine Singular prefixes
  if (["floresta", "formacao", "formacion", "vegetacao", "vegetacion",
       "foret", "prairie", "fruticee", "vegetacion"].includes(firstWord)) {
    return 'f';
  }
  // Feminine Plural prefixes
  if (["comunidades", "communautes"].includes(firstWord)) {
    return 'fp';
  }
  // Masculine Plural prefixes
  if (["campos", "bosques", "arbustais", "matorrales", "pastizales",
       "buissons", "fourres"].includes(firstWord)) {
    return 'mp';
  }
  
  // Default Masculine Singular (bosque, arbustal, subarbustal, campo, arboredo, matorral, pastizal)
  return 'm';
};

const getImpactGender = (impactDef: ImpactDef | undefined, safeLang: string): GrammaticalGender => {
  if (!impactDef) return 'm';
  return impactDef.genderByLang?.[safeLang as LangCode] ?? impactDef.gender;
};

const formatList = (items: string[], connector: string): string => {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  const last = items.pop();
  return `${items.join(', ')}${connector}${last}`;
};

// --- Main Generator Function ---

export function generateLandscapeName(data: LandscapeDataInput, lang: string = 'pt'): string {
  const safeLang = getSafeLang(lang);
  const t = TERMS[safeLang];
  const parts: string[] = [];

  // ---------------------------------------------------------
  // 1. VEGETATION PHYSIOGNOMY
  // ---------------------------------------------------------
  let vegName = "";
  
  if (data.veg_physiognomy_name) {
    vegName = data.veg_physiognomy_name;
  } else if (data.veg_structure) {
    const vegData = safeParse(data.veg_structure);
    if (vegData && vegData.physiognomy_name) {
      vegName = vegData.physiognomy_name;
    }
  }

  // Append complement if available
  if (data.veg_physiognomy_complement && data.veg_physiognomy_complement.trim()) {
    vegName = vegName ? `${vegName} - ${data.veg_physiognomy_complement}` : data.veg_physiognomy_complement;
  }

  // Detect vegetation gender/number for correct connector inflection
  const vegGender = getVegetationGender(vegName, t.not_classified_gender);

  if (!isUnclassifiedVegName(vegName)) {
    parts.push(vegName);
  } else {
    parts.push(t.not_classified);
  }

  // ---------------------------------------------------------
  // 2. ENVIRONMENT (Geomorphology)
  // ---------------------------------------------------------
  let geoString = "";

  if (data.geomorphology_type) {
    const geoTypes = data.geomorphology_type;
    let geoList: string[] = [];

    if (Array.isArray(geoTypes)) {
      geoList = geoTypes;
    } else if (typeof geoTypes === 'string') {
      if (geoTypes.startsWith('[') || geoTypes.includes(',')) {
        const parsed = safeParse(geoTypes);
        if (Array.isArray(parsed)) {
          geoList = parsed;
        } else {
          geoList = geoTypes.split(',').map(s => s.trim());
        }
      } else if (geoTypes.length > 0) {
        geoList = [geoTypes];
      }
    }

    if (geoList.length > 0) {
      // Labels are Title Case for their checkbox UI (e.g. "Lacustre"), but
      // here they're a category name mid-sentence, not a proper noun.
      geoString = geoList
        .map(value => {
          const option = geomorphologyTypeOptions.find(o => o.value === value);
          const label = option ? (option.label[safeLang] ?? option.label.pt) : value;
          return label.toLowerCase();
        })
        .join('/');
    }
  }

  if (geoString) {
    parts.push(`${t.on_env}${geoString}`);
  }

  // ---------------------------------------------------------
  // 3. DISTURBANCES / IMPACTS (With Gender Agreement)
  // ---------------------------------------------------------
  
  if (data.environmental_impacts) {
    const impactsObj = safeParse(data.environmental_impacts);
    
    if (impactsObj && Object.keys(impactsObj).length > 0) {
      const impactList = Object.entries(impactsObj)
        .map(([key, value]: [string, any]) => {
          const magnitude = value?.magnitude || "";
          const weight = getMagnitudeWeight(magnitude);
          
          return {
            originalKey: key, 
            weight: weight
          };
        })
        .filter(item => item.weight > 0);

      // Sort: Highest weight first
      impactList.sort((a, b) => b.weight - a.weight);

      // Select Top 2 Impacts
      const topImpacts = impactList.slice(0, 2);

      if (topImpacts.length > 0) {
        const impactStrings = topImpacts.map(i => {
          // Identify the impact data to get translation and grammatical gender
          const impactDef = IMPACT_TRANSLATIONS[i.originalKey];
          const impactGender = getImpactGender(impactDef, safeLang);
          
          // @ts-ignore - Get localized name
          const localizedName = impactDef ? impactDef[safeLang] : i.originalKey.toLowerCase();
          
          // Get the properly inflected adjective (e.g., 'severo' vs 'severa' vs 'severas')
          const adj = ADJECTIVES[safeLang][i.weight][impactGender];
          
          // Order: EN puts adjective first, PT/ES puts noun first
          if (safeLang === 'en') {
            return `${adj} ${localizedName}`; // "severe erosion"
          } else {
            return `${localizedName} ${adj}`; // PT/ES word order: noun first (e.g., "severe erosion")
          }
        });
        
        const impactText = formatList(impactStrings, t.and);
        
        // Push connector applying the Vegetation Gender logic + the impacts
        parts.push(`${t.influenced_by(vegGender)}${impactText}`);
      }
    }
  }

  // ---------------------------------------------------------
  // FINAL ASSEMBLY
  // ---------------------------------------------------------
  
  if (parts.length === 0) return t.undefined;
  
  return parts.join("");
}