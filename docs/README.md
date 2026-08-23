# Nomos architecture — reference documentation

Documentation kept faithful to Nomos's actual code (not to old planning specs), for ongoing reference on structure, concepts, and extension points of the app. Written by reading `protocol-kernel/`, `modules/paisageo/`, `modules/custom/`, `core/`, `db/`, `app/`, `contexts/` and `hooks/` directly. Where the code diverges from an earlier plan, that is noted inline in the relevant document.

## Index

1. [00_OVERVIEW.md](00_OVERVIEW.md) — what Nomos is, the core idea behind the plugin architecture, a navigation map to the other documents.
2. [01_ARCHITECTURE.md](01_ARCHITECTURE.md) — the 4 layers (core, kernel, protocols, screens/database), the one-way dependency rule, and where the kernel is actually instantiated in the React tree.
3. [02_GLOSSARY.md](02_GLOSSARY.md) — every code-level term (Manifest, Module, Capability, Registry, Bus...) with definitions verified against `protocol-kernel/types.ts`.
4. [03_TECH_STACK.md](03_TECH_STACK.md) — every real dependency and version, extracted from `package.json`.
5. [04_DIRECTORY_STRUCTURE.md](04_DIRECTORY_STRUCTURE.md) — the full `mobile-app/` tree, annotated folder by folder.
6. [05_DATA_MODEL.md](05_DATA_MODEL.md) — the real `points`/`point_modules` schema, how serialize/deserialize work, and a concrete example of a persisted point.
7. [06_KERNEL_AND_CAPABILITIES.md](06_KERNEL_AND_CAPABILITIES.md) — how `ProtocolRegistry` and `CapabilityBus` actually work, with the real case of Custom attaching an entire PAISAGEO scientific module via `modules/registry.ts`.
8. [07_EXPORT.md](07_EXPORT.md) — how the generic export engine expands dynamic columns (soil layers, vegetation strata, impacts).
9. [08_I18N.md](08_I18N.md) — the app's two translation mechanisms (UI strings vs. protocol fields) and why they aren't unified.
10. [09_SCREEN_FLOW.md](09_SCREEN_FLOW.md) — the real navigation map between screens and the end-to-end user flow (create project → collect → export).
11. [10_GUIDE_NEW_PROTOCOL.md](10_GUIDE_NEW_PROTOCOL.md) — step-by-step guide to implementing a brand-new scientific protocol.
12. [11_GUIDE_NEW_MODULE.md](11_GUIDE_NEW_MODULE.md) — smaller-scope guide: adding a module to an already-existing protocol.
13. [12_FAQ.md](12_FAQ.md) — short answers to recurring questions, with file/line references.

## Suggested reading order

For a first complete read-through: 00 → 01 → 02 → 05 → 06 → 07 → 09, then 10/11 when you're actually extending the app. 03, 04, 08, and 12 are for ad-hoc lookup.
