# 00. Overview

## What Nomos is

Nomos is a mobile app (React Native + Expo) for offline field environmental inventories: all data lives in local SQLite, with no backend. The context is academic (Master's research, PPGEO/UFPE, PAISAGEO group), and the main scientific protocol implemented is **PAISAGEO**, for landscape/vegetation cartography. The app also supports "custom" protocols, assembled by the user themself in a runtime form builder.

## The core idea: a plugin platform

The app isn't built "for PAISAGEO with an extra mode." It's a generic environmental-inventory platform, organized into four layers with a one-way dependency:

```
core/  ⟵  protocol-kernel/  ⟵  modules/<id>/  ⟵  app/ (screens)
```

- **`core/`** (the core): protocol-agnostic capabilities — map, species catalog, media, generic fields, generic export. It has no idea what PAISAGEO is.
- **`protocol-kernel/`** (the kernel): the plugin machinery itself — types, protocol registration (`ProtocolRegistry`), the capability bus (`CapabilityBus`), and the schema engine that expands dynamic columns for export. It also doesn't know any protocol by name.
- **`modules/<id>/`**: each scientific protocol (or the "custom" protocol) is a self-contained plugin, with its own manifest, collection modules, capabilities it exposes/consumes, and exporter.
- **`app/`**: the screens (Expo Router), which discover a project's behavior by asking the protocol's manifest, not by checking `if (protocol === "paisageo")`.

Two protocols exist today: **`paisageo`** (scientific, with 3 modules: vegetation, geoecological constraints, impacts) and **`custom`** (the "Personalized" protocol template, whose modules are generated at runtime from a JSON created by the user in the protocol builder). Neither imports code from the other directly — when custom wants to reuse an entire PAISAGEO scientific module (e.g. attaching the ready-made vegetation module to a form section), the communication goes through the aggregator catalog `modules/registry.ts`, never a direct import.

## Why this matters in practice

1. Adding a new scientific protocol (e.g. a fauna protocol) shouldn't require touching screens, the database, or the exporter — just creating a new folder under `modules/` that follows the same contract (`ProtocolManifest`, `ModuleDescriptor`, `ModuleSchema`).
2. The CSV/GeoJSON exporter already knows how to handle variable-cardinality structures (N soil layers, N vegetation strata, N impacts) because each module's schema describes that variation (`ModuleSchema.dynamic`), and the generic engine (`core/export/generic-export-engine.ts` + `core/schema/dynamic-columns.ts`) expands the columns on its own.
3. A protocol can reuse an entire scientific module from another (e.g. custom attaching PAISAGEO's geoecological constraints module) without a direct import between protocols, only going through the `modules/registry.ts` catalog.

## Navigation map: if you want to understand X, read Y

| To understand... | Read |
|---|---|
| The 4 layers and the dependency rule | [01_ARCHITECTURE.md](01_ARCHITECTURE.md) |
| The exact meaning of each term (Manifest, Module, Capability...) | [02_GLOSSARY.md](02_GLOSSARY.md) |
| Which libraries the app uses and at what version | [03_TECH_STACK.md](03_TECH_STACK.md) |
| Where everything lives in the code | [04_DIRECTORY_STRUCTURE.md](04_DIRECTORY_STRUCTURE.md) |
| How a collection point is saved to SQLite | [05_DATA_MODEL.md](05_DATA_MODEL.md) |
| How protocols register themselves and exchange capabilities | [06_KERNEL_AND_CAPABILITIES.md](06_KERNEL_AND_CAPABILITIES.md) |
| How CSV/GeoJSON is generated, including dynamic columns | [07_EXPORT.md](07_EXPORT.md) |
| How UI translation and protocol-field translation work | [08_I18N.md](08_I18N.md) |
| Which screens exist and how the user navigates between them | [09_SCREEN_FLOW.md](09_SCREEN_FLOW.md) |
| How to create a brand-new scientific protocol | [10_GUIDE_NEW_PROTOCOL.md](10_GUIDE_NEW_PROTOCOL.md) |
| How to add a module to an already-existing protocol | [11_GUIDE_NEW_MODULE.md](11_GUIDE_NEW_MODULE.md) |
| Quick answers to recurring questions | [12_FAQ.md](12_FAQ.md) |

## About this documentation's fidelity

This material was written by reading the actual code (`protocol-kernel/`, `modules/paisageo/`, `modules/custom/`, `core/`, `db/`, `app/`, `contexts/`, `hooks/`) rather than copying earlier planning documents. Where the code diverges from what was originally planned, that divergence is noted in the relevant document, and the code is always the source of truth.
