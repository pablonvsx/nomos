// The Drive is written only when the person taps Backup (or activates the
// backup). This guard reads the source and fails if anything outside
// core/ (screens, components, modules, hooks) reaches the Drive client or the
// token call directly: those are what a "silent sync after every save" needs.

import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..", "..");
const UI_DIRS = ["app", "components", "modules", "hooks", "contexts", "db", "utils"];

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

const uiFiles = UI_DIRS.flatMap((d) => sourceFiles(join(ROOT, d)));

describe("no automatic Drive writes", () => {
  it("no screen, component, module or hook imports the Drive client directly", () => {
    // A type-only import (e.g. DriveFile) cannot write anything.
    const offenders = uiFiles.filter((file) => /^import (?!type)[^;]*drive-sync\/drive-api-client/m.test(readFileSync(file, "utf8")));
    expect(offenders.map((f) => f.replace(ROOT, ""))).toEqual([]);
  });

  it("the former silent sync service is gone", () => {
    const offenders = uiFiles.filter((file) => /catalog-sync-service|sync(SpeciesCatalog|VegetationClasses|ActiveVegetationClassification)ToDrive/.test(readFileSync(file, "utf8")));
    expect(offenders.map((f) => f.replace(ROOT, ""))).toEqual([]);
  });

  it("getTokens is called from exactly one place", () => {
    const coreFiles = sourceFiles(join(ROOT, "core"));
    const callers = [...uiFiles, ...coreFiles].filter((file) => /\.getTokens\(/.test(readFileSync(file, "utf8")));
    expect(callers.map((f) => f.replace(ROOT, ""))).toEqual(["/core/google-auth/google-auth-service.ts"]);
  });
});
