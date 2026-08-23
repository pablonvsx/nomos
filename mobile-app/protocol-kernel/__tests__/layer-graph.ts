import * as fs from "fs";
import * as path from "path";
import * as ts from "typescript";

/**
 * Minimal AST-based import graph builder for mobile-app/ production files,
 * shared by layer-rules.test.ts. Mirrors the method used in
 * docs/arquitetura-nomos/audit/extract-imports.js (same repo, kept as a
 * separate, smaller copy here so this test has no dependency outside
 * mobile-app/). If the two ever drift, re-sync by hand — there is no
 * runtime code sharing between them by design.
 */

export interface LayerEdge {
  fromFile: string; // repo-relative, POSIX
  toFile: string; // repo-relative, POSIX
  fromBucket: string;
  toBucket: string;
  kind: "value" | "type";
  line: number;
}

const APP_ROOT = path.resolve(__dirname, "..", "..");

const EXCLUDE_DIR_NAMES = new Set([
  "node_modules",
  "__tests__",
  "scripts",
  ".expo",
  "dist",
  "android",
  "ios",
  ".git",
]);

function isExcludedFile(filePath: string): boolean {
  const base = path.basename(filePath);
  if (base.endsWith(".d.ts")) return true;
  if (/\.test\.tsx?$/.test(base)) return true;
  return false;
}

function walk(dir: string, out: string[]): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (EXCLUDE_DIR_NAMES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !isExcludedFile(full)) {
      out.push(full);
    }
  }
  return out;
}

const REPO_ROOT = path.resolve(APP_ROOT, "..");
const TSCONFIG_PATH = path.join(APP_ROOT, "tsconfig.json");

const configFile = ts.readConfigFile(TSCONFIG_PATH, ts.sys.readFile);
const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, APP_ROOT);
const tsPaths = parsedConfig.options.paths || {};
const aliasBase = parsedConfig.options.baseUrl
  ? path.resolve(APP_ROOT, parsedConfig.options.baseUrl)
  : path.dirname(TSCONFIG_PATH);

function resolveAlias(specifier: string): string | null {
  for (const [key, targets] of Object.entries(tsPaths)) {
    if (key.endsWith("*")) {
      const prefix = key.slice(0, -1);
      if (specifier.startsWith(prefix)) {
        const rest = specifier.slice(prefix.length);
        const target = (targets as string[])[0].replace("*", rest);
        return path.resolve(aliasBase, target);
      }
    } else if (key === specifier) {
      return path.resolve(aliasBase, (targets as string[])[0]);
    }
  }
  return null;
}

const RESOLUTION_SUFFIXES = ["", ".ts", ".tsx", ".d.ts", "/index.ts", "/index.tsx", ".json"];

function resolveToFile(candidateBase: string): string | null {
  for (const suffix of RESOLUTION_SUFFIXES) {
    const candidate = candidateBase + suffix;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(candidate);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    const dir = path.dirname(candidate);
    const base = path.basename(candidate);
    let dirEntries: string[];
    try {
      dirEntries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    if (!dirEntries.includes(base)) continue;
    return candidate;
  }
  return null;
}

function resolveSpecifier(fromFile: string, specifier: string): string | null {
  if (specifier.startsWith(".")) {
    return resolveToFile(path.resolve(path.dirname(fromFile), specifier));
  }
  const aliasResolved = resolveAlias(specifier);
  if (aliasResolved) return resolveToFile(aliasResolved);
  return null; // external package - not part of the internal layer graph
}

function toRepoRelative(absPath: string): string {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join("/");
}

/**
 * First path segment under mobile-app/, with modules/ split by protocol
 * namespace so each protocol (and the registry.ts / bootstrap.ts
 * composition-root files) is its own bucket.
 */
export function classifyBucket(absPath: string): string {
  const relSegments = path.relative(APP_ROOT, absPath).split(path.sep);
  const top = relSegments[0];
  if (top === "modules") {
    if (relSegments.length === 2 && relSegments[1]!.endsWith(".ts")) {
      // modules/registry.ts, modules/bootstrap.ts - direct files, not a
      // protocol namespace. Distinguished from protocol dirs below.
      return `modules/${relSegments[1]}`;
    }
    if (relSegments[1]) return `modules/${relSegments[1]}`;
    return "modules";
  }
  return top!;
}

function collectFileEdges(filePath: string): Array<{ specifier: string; kind: "value" | "type"; line: number }> {
  const text = fs.readFileSync(filePath, "utf8");
  const scriptKind = filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, scriptKind);
  const edges: Array<{ specifier: string; kind: "value" | "type"; line: number }> = [];

  function lineOf(node: ts.Node): number {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  }

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const isTypeOnly = !!node.importClause?.isTypeOnly;
      edges.push({ specifier: node.moduleSpecifier.text, kind: isTypeOnly ? "type" : "value", line: lineOf(node) });
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      edges.push({
        specifier: node.moduleSpecifier.text,
        kind: node.isTypeOnly ? "type" : "value",
        line: lineOf(node),
      });
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) {
        edges.push({ specifier: arg.text, kind: "value", line: lineOf(node) });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return edges;
}

let cachedEdges: LayerEdge[] | null = null;

/** Builds (and memoizes) the full production-file import graph, bucketed. */
export function buildProductionEdges(): LayerEdge[] {
  if (cachedEdges) return cachedEdges;

  const productionFiles = walk(APP_ROOT, []);
  const edges: LayerEdge[] = [];

  for (const file of productionFiles) {
    for (const e of collectFileEdges(file)) {
      const resolved = resolveSpecifier(file, e.specifier);
      if (!resolved) continue; // external package, or unresolved (not our concern here)
      edges.push({
        fromFile: toRepoRelative(file),
        toFile: toRepoRelative(resolved),
        fromBucket: classifyBucket(file),
        toBucket: classifyBucket(resolved),
        kind: e.kind,
        line: e.line,
      });
    }
  }

  cachedEdges = edges;
  return edges;
}

/** Protocol namespace directories under modules/ (excludes generic/ and direct files like registry.ts, bootstrap.ts). */
export function listProtocolNamespaces(): string[] {
  const modulesDir = path.join(APP_ROOT, "modules");
  return fs
    .readdirSync(modulesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "generic")
    .map((e) => e.name);
}
