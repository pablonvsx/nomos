// src/contexts/i18n-context.tsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import {
  initializeI18n,
  changeLanguage,
  getCurrentLanguage,
  getTranslations,
} from "@/utils/i18n";

interface I18nContextType {
  currentLanguage: string;
  setLanguage: (languageCode: string) => Promise<void>;
  t: (key: string, options?: any) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [currentLanguage, setCurrentLanguage] = useState<string>("pt");
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      await initializeI18n();
      setCurrentLanguage(getCurrentLanguage());
      setIsInitialized(true);
    };
    initialize();
  }, []);

  const setLanguage = useCallback(async (languageCode: string) => {
    await changeLanguage(languageCode);
    setCurrentLanguage(languageCode);
  }, []);

  // Helper function to get nested translation
  const getNestedTranslation = (obj: any, path: string): string => {
    const keys = path.split(".");
    let result = obj;

    for (const key of keys) {
      if (result && typeof result === "object" && key in result) {
        result = result[key];
      } else {
        return path;
      }
    }

    return typeof result === "string" ? result : path;
  };

  // Create t() function that depends on currentLanguage state. Memoized so
  // it only gets a new identity when the language actually changes -
  // otherwise every consumer that lists `t` in a useCallback/useEffect dep
  // array (e.g. screens that reload data via useFocusEffect) would see a
  // fresh function on every render and re-run unnecessarily.
  const t = useCallback(
    (key: string, options?: any): string => {
      const translations = getTranslations(currentLanguage);
      const translation = getNestedTranslation(translations, key);

      if (options) {
        let result = translation;
        Object.keys(options).forEach((optionKey) => {
          result = result.replace(`{{${optionKey}}}`, options[optionKey]);
        });
        return result;
      }

      return translation;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentLanguage],
  );

  const value = useMemo(
    () => ({ currentLanguage, setLanguage, t }),
    [currentLanguage, setLanguage, t],
  );

  if (!isInitialized) {
    return null; // or a loading spinner
  }

  return (
    <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
  );
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
};
