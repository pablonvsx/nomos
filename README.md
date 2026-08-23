# Nomos

![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)
![Platform: Android](https://img.shields.io/badge/platform-Android-3DDC84.svg)
![Built with Expo](https://img.shields.io/badge/built%20with-Expo-000020.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6.svg)

Mobile application for environmental inventories, built as an extensible platform capable of hosting multiple field survey protocols. Its initial version operationalizes a geosystemic protocol for landscape cartography.

---

## Academic Context

<div align="justify">

<strong>Nomos</strong> is a technological product developed as part of master's research linked to the <strong>Graduate Program in Geography (PPGEO)</strong> at the <strong>Federal University of Pernambuco (UFPE)</strong>. Its design was initially guided by the methodological requirements of Landscape Cartography, with an emphasis on systematizing field surveys and strengthening the analytical traceability and interoperability of the collected data.

</div>

- **Author:** [Pablo Guilherme de Melo Neves](https://www.researchgate.net/profile/Pablo-Neves-2)
- **Advisor:** [Lucas Costa de Souza Cavalcanti](https://www.researchgate.net/profile/Lucas-Cavalcanti-7)
- **Research Group:** [PAISAGEO - Geography of Tropical Landscapes](https://sites.ufpe.br/paisageo/)

---

## About the Project

<div align="justify">

<strong>Nomos</strong> is a mobile application developed to support environmental inventories. In its initial version, the system implements a landscape mapping protocol developed under the PPGEO-UFPE program, serving as a technical-methodological intermediary to replace analog records with a structured, standardized, and reproducible digital workflow.

</div>

<div align="justify">

Beyond data collection based on the primary methodological instrument, the app allows for the use of simpler, custom protocols created by the user, paving the way for the implementation of other smart protocols in future versions. This flexibility stems from a modular, plugin-based architecture in which each protocol constitutes a self-contained, interoperable module capable of reusing functionalities already available in other system protocols without depending on their internal implementation. This integration of a standardized collection workflow with customization flexibility contributes to greater agility in preliminary information processing and enhances the robustness of documentation for empirical field research.

</div>

---

## Features

- **Offline-first data collection.** All records are persisted locally in SQLite; no connectivity is required in the field.
- **Automated physiognomic classification.** Generates the vegetation formula following the Küchler system and classifies the dominant life form through a decision-tree procedure.
- **Standardized landscape naming.** Composes the landscape unit nomenclature from the attributes observed in the field, reducing interpretive variability between surveyors.
- **Modular protocol architecture.** The reference protocol is one module among others; users can build and run custom, self-contained protocols on the same platform.
- **Species catalog integration.** Connects to GBIF and SpeciesLink for taxonomic verification during collection.
- **Structured exports.** Outputs data as GeoJSON and CSV, and packages field media into a compressed archive, ready for use in GIS and statistical software.
- **Multilingual interface.** Available in Portuguese, English, Spanish, and French.

---

## Tech Stack

- **Main Framework:** React Native with Expo
- **Language:** TypeScript
- **Local Database:** SQLite
- **UI Layer:** React Native Paper
- **Maps:** React Native Maps with Google Maps integration

---

## Installation

Requirements: Node.js and the Expo CLI.

```bash
# clone the repository
git clone https://github.com/pablonvsx/nomos.git
cd nomos/mobile-app

# install dependencies
npm install

# start the development server
npm start

# or run directly on a connected Android device / emulator
npm run android
```

A pre-built APK of the latest release is also available under [Releases](https://github.com/pablonvsx/nomos/releases) or in the [Documentation](#documentation) folder below, for users who only want to install the app without building it from source.

---

## Documentation

- **User guide and field materials:** [Google Drive folder](https://drive.google.com/drive/folders/1Ikc18svAf_pBV3j8QSXvILa6XqKRPcRI?usp=sharing) — practical usage guide, printable field sheet, and the vegetation classification catalog. The installable APK is also available here.
- **Architecture documentation:** see the `docs/` directory in this repository for the layered architecture, data model, and internationalization notes. All documents are written in English.
- **In-app tutorials:** step-by-step walkthroughs are available directly inside the app, no external documentation needed for basic field use.
- **Archival record (DOI):** [10.5281/zenodo.22069701](https://doi.org/10.5281/zenodo.22069701) — citable, versioned deposit on Zenodo.

---

## License

Nomos is distributed under the **GNU General Public License v3.0**. See [`LICENSE`](./LICENSE) for the full text.

---

## Citation

If you use Nomos in academic work, please cite it. A `CITATION.cff` file is provided in the repository root for automatic citation generation.
