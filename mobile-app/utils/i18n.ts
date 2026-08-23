// src/utils/i18n.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

// Import translations
import pt from "@/locales/pt.json";
import en from "@/locales/en.json";
import es from "@/locales/es.json";
import fr from "@/locales/fr.json";

type Translations = typeof pt;

const translations: Record<string, Translations> = {
  pt: pt,
  en: en as Translations,
  es: es as Translations,
  fr: fr as Translations,
};

let currentLocale = "pt";

const LANGUAGE_KEY = "@nomos:language";

export const initializeI18n = async () => {
  try {
    const savedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
    if (savedLanguage && translations[savedLanguage]) {
      currentLocale = savedLanguage;
    }
  } catch (error) {
    console.error("Error loading saved language:", error);
  }
};

export const changeLanguage = async (languageCode: string) => {
  try {
    if (translations[languageCode]) {
      currentLocale = languageCode;
      await AsyncStorage.setItem(LANGUAGE_KEY, languageCode);
    }
  } catch (error) {
    console.error("Error saving language:", error);
  }
};

export const getCurrentLanguage = () => currentLocale;

export const getAvailableLanguages = () => [
  { code: "pt", name: "Português", nativeName: "Português" },
  { code: "en", name: "English", nativeName: "English" },
  { code: "es", name: "Español", nativeName: "Español" },
  { code: "fr", name: "Français", nativeName: "Français" },
];

export const getTranslations = (languageCode: string): Translations => {
  return translations[languageCode] || translations["pt"];
};

const getNestedTranslation = (obj: any, path: string): string => {
  const keys = path.split(".");
  let result = obj;

  for (const key of keys) {
    if (result && typeof result === "object" && key in result) {
      result = result[key];
    } else {
      return path; // Return key if translation not found
    }
  }

  return typeof result === "string" ? result : path;
};

export const t = (key: string, options?: any): string => {
  const translation = getNestedTranslation(translations[currentLocale], key);

  if (options) {
    let result = translation;
    Object.keys(options).forEach((optionKey) => {
      result = result.replace(`{{${optionKey}}}`, options[optionKey]);
    });
    return result;
  }

  return translation;
};

export default {
  t,
  initializeI18n,
  changeLanguage,
  getCurrentLanguage,
  getAvailableLanguages,
};
