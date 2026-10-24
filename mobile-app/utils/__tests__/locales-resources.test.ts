import { readFileSync } from "fs";
import { join } from "path";

const LANGUAGES = ["pt", "en", "es", "fr"] as const;
const EM_DASH = "—";

function leafKeys(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => leafKeys(v, prefix ? `${prefix}.${k}` : k));
}

type Locale = {
  tabs: Record<string, string>;
  resources: Record<string, string>;
  about: Record<string, string>;
  driveBackup: Record<string, unknown>;
};

const locales = Object.fromEntries(
  LANGUAGES.map((lang) => [
    lang,
    JSON.parse(readFileSync(join(__dirname, "..", "..", "locales", `${lang}.json`), "utf8")) as Locale,
  ]),
) as Record<(typeof LANGUAGES)[number], Locale>;

const CITE_KEYS = ["cite", "citeDesc", "citeReference", "openDoi", "copyReference", "copied", "openDoiError"];

/** The texts this feature owns: the whole Resources namespace (citation included) and the About intro. */
function ownedTexts(locale: Locale): [string, string][] {
  return [
    ...Object.entries(locale.resources).map(([k, v]) => [`resources.${k}`, v] as [string, string]),
    ["about.description", locale.about.description],
  ];
}

describe("resources and citation locale keys", () => {
  it("defines the same resources keys in every language", () => {
    const reference = Object.keys(locales.pt.resources).sort();
    for (const lang of LANGUAGES) {
      expect(Object.keys(locales[lang].resources).sort()).toEqual(reference);
    }
  });

  it("defines the citation keys under resources, and none are left on the About screen", () => {
    for (const lang of LANGUAGES) {
      for (const key of CITE_KEYS) {
        expect(typeof locales[lang].resources[key]).toBe("string");
        expect(locales[lang].resources[key].length).toBeGreaterThan(0);
        expect(locales[lang].about[key]).toBeUndefined();
      }
    }
  });

  it("defines the same driveBackup keys (backup modal, status, export warning) in every language", () => {
    const reference = leafKeys(locales.pt.driveBackup).sort();
    for (const lang of LANGUAGES) {
      expect(leafKeys(locales[lang].driveBackup).sort()).toEqual(reference);
    }
  });

  it("no longer carries the internet requirement line", () => {
    for (const lang of LANGUAGES) {
      expect(locales[lang].resources.requiresInternet).toBeUndefined();
    }
  });

  it("has a tab label for the resources tab and no leftover help tab", () => {
    for (const lang of LANGUAGES) {
      expect(locales[lang].tabs.resources).toBeTruthy();
      expect(locales[lang].tabs.help).toBeUndefined();
    }
  });

  it("does not hardcode the app version in the locale files", () => {
    for (const lang of LANGUAGES) {
      expect((locales[lang] as unknown as { home: Record<string, string> }).home.version).toBeUndefined();
    }
  });

  it("keeps every citation reference filled by the same placeholders", () => {
    for (const lang of LANGUAGES) {
      const placeholders = locales[lang].resources.citeReference.match(/\{\{\w+\}\}/g)?.sort();
      expect(placeholders).toEqual(["{{author}}", "{{doi}}", "{{year}}"]);
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
