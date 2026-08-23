import { buildProductionEdges, listProtocolNamespaces } from "./layer-graph";

/**
 * Generalizes the old protocol-isolation.test.ts into a full layer-boundary
 * check. Rules are declared as DATA (one row per "layer X cannot import
 * from layer Y"), not as scattered conditionals, so this table is citable
 * on its own as the automated verification of the layer ordering documented
 * in docs/arquitetura-nomos/13_DIAGNOSTICO_CAMADAS.md. If the approved
 * ordering ever changes, this table is the one place to update.
 *
 * `allow: "none"` — zero edges tolerated, of any kind.
 * `allow: "type-only"` — value edges are violations; `import type` /
 * `export type` edges are a tolerated, deliberate exception (documented
 * per-rule below with the reason).
 */
type Allow = "none" | "type-only";

interface LayerRule {
  name: string;
  from: (bucket: string) => boolean;
  to: (bucket: string) => boolean;
  allow: Allow;
}

const PROTOCOL_NAMESPACES = listProtocolNamespaces();
const isProtocol = (bucket: string) => PROTOCOL_NAMESPACES.some((ns) => bucket === `modules/${ns}`);

const LAYER_RULES: LayerRule[] = [
  {
    name: "core/ does not import protocol-kernel/ by value (types only) — see docs/arquitetura-nomos/13_DIAGNOSTICO_CAMADAS.md §7",
    from: (b) => b === "core",
    to: (b) => b === "protocol-kernel",
    allow: "type-only",
  },
  {
    name: "protocol-kernel/ does not import core/ in any form (the old type exception was eliminated by unifying the duplicated ProtocolExporter/MediaFiles/AudioNote definition in the kernel — see 13_DIAGNOSTICO_CAMADAS.md §4)",
    from: (b) => b === "protocol-kernel",
    to: (b) => b === "core",
    allow: "none",
  },
  {
    name: "protocol-kernel/ does not import modules/<protocol>/ (no protocol, no exception — bootstrap lives in modules/bootstrap.ts)",
    from: (b) => b === "protocol-kernel",
    to: (b) => isProtocol(b),
    allow: "none",
  },
  {
    name: "protocol-kernel/ does not import app/",
    from: (b) => b === "protocol-kernel",
    to: (b) => b === "app",
    allow: "none",
  },
  {
    name: "modules/generic/ does not import modules/<protocol>/ (no exception, not even types — generic/ has no protocol identity)",
    from: (b) => b === "modules/generic",
    to: (b) => isProtocol(b),
    allow: "none",
  },
  {
    name: "modules/generic/ does not import protocol-kernel/ by value (types only)",
    from: (b) => b === "modules/generic",
    to: (b) => b === "protocol-kernel",
    allow: "type-only",
  },
  {
    name: "db/ does not import modules/<protocol>/",
    from: (b) => b === "db",
    to: (b) => isProtocol(b),
    allow: "none",
  },
  {
    name: "components/ does not import modules/<protocol>/",
    from: (b) => b === "components",
    to: (b) => isProtocol(b),
    allow: "none",
  },
  {
    name: "components/ does not import protocol-kernel/",
    from: (b) => b === "components",
    to: (b) => b === "protocol-kernel",
    allow: "none",
  },
  {
    name: "no layer imports from app/ (app/ is the top)",
    from: (b) => b !== "app",
    to: (b) => b === "app",
    allow: "none",
  },
];

// Cross-protocol isolation, generalized for N protocols: no protocol
// imports another directly. modules/registry.ts and modules/bootstrap.ts are
// distinct buckets (not `modules/<ns>`) and are therefore automatically
// excluded from this rule - they are the aggregator/composition-root allowed
// to know about all protocols.
for (const ns of PROTOCOL_NAMESPACES) {
  for (const other of PROTOCOL_NAMESPACES) {
    if (ns === other) continue;
    LAYER_RULES.push({
      name: `modules/${ns}/ does not import modules/${other}/ directly (outside the modules/registry.ts / modules/bootstrap.ts aggregator)`,
      from: (b) => b === `modules/${ns}`,
      to: (b) => b === `modules/${other}`,
      allow: "none",
    });
  }
}

describe("layer rules (declared as data)", () => {
  const edges = buildProductionEdges();

  it("found at least two protocols to test cross-protocol isolation", () => {
    expect(PROTOCOL_NAMESPACES.length).toBeGreaterThanOrEqual(2);
  });

  it("the production import graph is not empty (extractor sanity check)", () => {
    expect(edges.length).toBeGreaterThan(100);
  });

  for (const rule of LAYER_RULES) {
    it(rule.name, () => {
      const violations = edges.filter(
        (e) => rule.from(e.fromBucket) && rule.to(e.toBucket) && (rule.allow === "none" || e.kind === "value")
      );
      expect(violations).toEqual([]);
    });
  }
});
