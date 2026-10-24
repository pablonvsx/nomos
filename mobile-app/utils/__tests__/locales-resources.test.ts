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

/** The texts this feature owns: the whole Resources namespace and the About intro. */
function ownedTexts(locale: Locale): [string, string][] {
  return [
    ...Object.entries(locale.resources).map(([k, v]) => [`resources.${k}`, v] as [string, string]),
    ["about.description", locale.about.description],
  ];
}

describe("resources locale keys", () => {
  it("defines the same resources keys in every language", () => {
    const reference = Object.keys(locales.pt.resources).sort();
    for (const lang of LANGUAGES) {
      expect(Object.keys(locales[lang].resources).sort()).toEqual(reference);
    }
  });

  it("no longer carries the citation keys, on the Resources screen or on About (the page of the app has them)", () => {
    for (const lang of LANGUAGES) {
      for (const key of ["cite", "citeDesc", "citeReference", "openDoi", "copyReference", "copied", "openDoiError"]) {
        expect(locales[lang].resources[key]).toBeUndefined();
        expect(locales[lang].about[key]).toBeUndefined();
      }
    }
  });

  it("mentions how to cite in the Resources intro", () => {
    expect(locales.pt.resources.intro).toContain("como citar");
    expect(locales.en.resources.intro).toContain("how to cite");
    expect(locales.es.resources.intro).toContain("cómo citar");
    expect(locales.fr.resources.intro).toContain("comment citer");
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

  it("has no em dashes in the texts of this feature", () => {
    for (const lang of LANGUAGES) {
      for (const [key, text] of ownedTexts(locales[lang])) {
        expect({ lang, key, hasEmDash: text.includes(EM_DASH) }).toEqual({ lang, key, hasEmDash: false });
      }
    }
  });
});
