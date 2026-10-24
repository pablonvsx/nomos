import { readFileSync } from "fs";
import { join } from "path";

const LANGUAGES = ["pt", "en", "es", "fr"] as const;
const EM_DASH = "—";

type Locale = {
  tabs: Record<string, string>;
  resources: Record<string, string>;
  about: Record<string, string>;
};

const locales = Object.fromEntries(
  LANGUAGES.map((lang) => [
    lang,
    JSON.parse(readFileSync(join(__dirname, "..", "..", "locales", `${lang}.json`), "utf8")) as Locale,
  ]),
) as Record<(typeof LANGUAGES)[number], Locale>;

const CITE_KEYS = ["cite", "citeDesc", "citeReference", "openDoi", "copyReference", "copied", "openDoiError"];

/** The texts this feature owns: the whole Resources namespace, the About intro and the citation. */
function ownedTexts(locale: Locale): [string, string][] {
  return [
    ...Object.entries(locale.resources).map(([k, v]) => [`resources.${k}`, v] as [string, string]),
    ["about.description", locale.about.description],
    ...CITE_KEYS.map((k) => [`about.${k}`, locale.about[k]] as [string, string]),
  ];
}

describe("resources and citation locale keys", () => {
  it("defines the same resources keys in every language", () => {
    const reference = Object.keys(locales.pt.resources).sort();
    for (const lang of LANGUAGES) {
      expect(Object.keys(locales[lang].resources).sort()).toEqual(reference);
    }
  });

  it("defines the citation keys in every language", () => {
    for (const lang of LANGUAGES) {
      for (const key of CITE_KEYS) {
        expect(typeof locales[lang].about[key]).toBe("string");
        expect(locales[lang].about[key].length).toBeGreaterThan(0);
      }
    }
  });

  it("has a tab label for the resources tab and no leftover help tab", () => {
    for (const lang of LANGUAGES) {
      expect(locales[lang].tabs.resources).toBeTruthy();
      expect(locales[lang].tabs.help).toBeUndefined();
    }
  });

  it("keeps every citation reference filled by the same placeholders", () => {
    for (const lang of LANGUAGES) {
      const placeholders = locales[lang].about.citeReference.match(/\{\{\w+\}\}/g)?.sort();
      expect(placeholders).toEqual(["{{author}}", "{{doi}}", "{{version}}", "{{year}}"]);
    }
  });

  it("has no em dashes in the texts of this feature", () => {
    for (const lang of LANGUAGES) {
      for (const [key, text] of ownedTexts(locales[lang])) {
        expect({ lang, key, hasEmDash: text.includes(EM_DASH) }).toEqual({ lang, key, hasEmDash: false });
      }
    }
  });
});
