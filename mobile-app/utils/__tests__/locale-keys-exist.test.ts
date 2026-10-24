// Every translation key the source asks for must exist in every language. A
// missing key is shown to the user as the key itself ("common.alert"), which
// is how a validation dialog once got that title. This reads the source and
// the locale files and fails on the first typo or forgotten key.

import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..");
const LANGUAGES = ["pt", "en", "es", "fr"] as const;
const SOURCE_DIRS = ["app", "components", "core", "hooks", "modules", "utils", "contexts", "constants"];

function leafKeys(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => leafKeys(v, prefix ? `${prefix}.${k}` : k));
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const locales = Object.fromEntries(
  LANGUAGES.map((lang) => [lang, new Set(leafKeys(JSON.parse(readFileSync(join(ROOT, "locales", `${lang}.json`), "utf8"))))]),
) as Record<(typeof LANGUAGES)[number], Set<string>>;

const namespaces = new Set([...locales.pt].map((key) => key.split(".")[0]));

/** A string literal that looks like "namespace.some.key" for a real top-level namespace. */
const KEY_LITERAL = /["'`]([a-zA-Z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+)["'`]/g;

function referencedKeys(): Map<string, string> {
  const found = new Map<string, string>();
  for (const dir of SOURCE_DIRS) {
    for (const file of sourceFiles(join(ROOT, dir))) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(KEY_LITERAL)) {
        const key = match[1];
        if (!namespaces.has(key.split(".")[0])) continue;
        if (!found.has(key)) found.set(key, file.replace(ROOT, ""));
      }
    }
  }
  return found;
}

describe("translation keys used by the source", () => {
  const referenced = referencedKeys();

  it.each(LANGUAGES)("exist in the %s locale", (lang) => {
    const missing = [...referenced]
      .filter(([key]) => !locales[lang].has(key))
      // A namespace object (e.g. 'species.catalogParseError') is built into a full key at runtime.
      .filter(([key]) => ![...locales[lang]].some((existing) => existing.startsWith(`${key}.`)))
      .map(([key, file]) => `${key} (${file})`);
    expect(missing).toEqual([]);
  });
});
