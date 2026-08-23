// Kuchler matrix configuration (helper text, height classes, cover classes,
// leaf adaptations, life forms), including the per-item help text shown via
// the info-bubble taps in KuchlerMatrix.tsx. Ported from the legacy
// assets/protocols/paisageo/paisageo_protocol.json so the vegetation module
// no longer depends on that asset directly (Fase 1 of the plugin-architecture
// migration).

export const KUCHLER_CONFIG = {
  "helper_text": {
    "pt": "Cruze a Linha (Altura) com a Coluna (Forma de Vida) e insira o Grau de Cobertura na Célula.",
    "en": "Cross the Row (Height) with the Column (Life Form).",
    "es": "Cruce la Fila (Altura) con la Columna (Forma de Vida).",
    "fr": "Croisez la Ligne (Hauteur) avec la Colonne (Forme de Vie)."
  },
  "height_classes": [
    {
      "id": "8",
      "label": "> 35m",
      "desc": {
        "pt": "Árvores emergentes",
        "en": "Emergent trees",
        "es": "Árboles emergentes",
        "fr": "Arbres émergents"
      }
    },
    {
      "id": "7",
      "label": "20 - 35m",
      "desc": {
        "pt": "Dossel alto",
        "en": "High canopy",
        "es": "Dosel alto",
        "fr": "Canopée haute"
      }
    },
    {
      "id": "6",
      "label": "10 - 20m",
      "desc": {
        "pt": "Dossel médio",
        "en": "Medium canopy",
        "es": "Dosel medio",
        "fr": "Canopée moyenne"
      }
    },
    {
      "id": "5",
      "label": "5 - 10m",
      "desc": {
        "pt": "Arvoretas/Dossel baixo",
        "en": "Saplings/Low canopy",
        "es": "Arbolillos/Dosel bajo",
        "fr": "Gaulis/Canopée basse"
      }
    },
    {
      "id": "4",
      "label": "2 - 5m",
      "desc": {
        "pt": "Arbustos altos",
        "en": "Tall shrubs",
        "es": "Arbustos altos",
        "fr": "Arbustes hauts"
      }
    },
    {
      "id": "3",
      "label": "0.5 - 2m",
      "desc": {
        "pt": "Arbustos baixos",
        "en": "Low shrubs",
        "es": "Arbustos bajos",
        "fr": "Arbustes bas"
      }
    },
    {
      "id": "2",
      "label": "0.1 - 0.5m",
      "desc": {
        "pt": "Subarbustos/Herbáceas altas",
        "en": "Subshrubs/Tall herbs",
        "es": "Subarbustos/Hierbas altas",
        "fr": "Sous-arbrisseaux/Herbes hautes"
      }
    },
    {
      "id": "1",
      "label": "< 0.1m",
      "desc": {
        "pt": "Rasteiras/Herbáceas baixas",
        "en": "Creeping/Low herbs",
        "es": "Rastreras/Hierbas bajas",
        "fr": "Herbes rampantes/Herbes basses"
      }
    }
  ],
  "cover_classes": [
    {
      "id": "c",
      "label": "c (>75%)",
      "name": {
        "pt": "Contínua",
        "en": "Continuous",
        "es": "Continua",
        "fr": "Continue"
      },
      "desc": {
        "pt": "Copas se tocam",
        "en": "Crowns touch",
        "es": "Copas se tocan",
        "fr": "Couronnes se touchant"
      }
    },
    {
      "id": "i",
      "label": "i (50-75%)",
      "name": {
        "pt": "Interrompida",
        "en": "Interrupted",
        "es": "Interrumpida",
        "fr": "Interrompue"
      },
      "desc": {
        "pt": "Copas próximas",
        "en": "Crowns close",
        "es": "Copas cercanas",
        "fr": "Couronnes proches"
      }
    },
    {
      "id": "p",
      "label": "p (25-50%)",
      "name": {
        "pt": "Parque",
        "en": "Park",
        "es": "Parque",
        "fr": "Parc"
      },
      "desc": {
        "pt": "Indivíduos em grupos",
        "en": "Individuals in groups",
        "es": "Individuos en grupos",
        "fr": "Individus en groupes"
      }
    },
    {
      "id": "r",
      "label": "r (5-25%)",
      "name": {
        "pt": "Rara",
        "en": "Rare",
        "es": "Rara",
        "fr": "Rare"
      },
      "desc": {
        "pt": "Indivíduos isolados",
        "en": "Isolated individuals",
        "es": "Individuos aislados",
        "fr": "Individus isolés"
      }
    },
    {
      "id": "b",
      "label": "b (1-5%)",
      "name": {
        "pt": "Esparsa",
        "en": "Sparse",
        "es": "Esparcida",
        "fr": "Éparse"
      },
      "desc": {
        "pt": "Ocorrência ocasional",
        "en": "Occasional occurrence",
        "es": "Ocurrencia ocasional",
        "fr": "Occurrence occasionnelle"
      }
    }
  ],
  "leaf_adaptations": [
    {
      "id": "h",
      "label": "h",
      "name": {
        "pt": "Rígida",
        "en": "Rigid",
        "es": "Rígida",
        "fr": "Rigide"
      },
      "desc": {
        "pt": "Esclerófilas/coriáceas (duras)",
        "en": "Sclerophyllous/coriaceous (hard)",
        "es": "Esclerófilas/coriáceas (duras)",
        "fr": "Sclérophylles/coriaces (dures)"
      }
    },
    {
      "id": "w",
      "label": "w",
      "name": {
        "pt": "Leve",
        "en": "Light",
        "es": "Ligera",
        "fr": "Légère"
      },
      "desc": {
        "pt": "Malacófilas (flexíveis)",
        "en": "Malacophyllous (flexible)",
        "es": "Malacófilas (flexibles)",
        "fr": "Malacophylles (flexibles)"
      }
    },
    {
      "id": "k",
      "label": "k",
      "name": {
        "pt": "Suculenta",
        "en": "Succulent",
        "es": "Suculenta",
        "fr": "Succulente"
      },
      "desc": {
        "pt": "Folhas suculentas",
        "en": "Succulent leaves",
        "es": "Hojas suculentas",
        "fr": "Feuilles succulentes"
      }
    },
    {
      "id": "l",
      "label": "l",
      "name": {
        "pt": "Grande",
        "en": "Large",
        "es": "Grande",
        "fr": "Grande"
      },
      "desc": {
        "pt": "Megáfilas (>400 cm²)",
        "en": "Megaphylls (>400 cm²)",
        "es": "Megáfilas (>400 cm²)",
        "fr": "Mégaphylles (>400 cm²)"
      }
    },
    {
      "id": "s",
      "label": "s",
      "name": {
        "pt": "Pequena",
        "en": "Small",
        "es": "Pequeña",
        "fr": "Petite"
      },
      "desc": {
        "pt": "Leptófilas/nanófilas (<4 cm²)",
        "en": "Leptophylls/nanophylls (<4 cm²)",
        "es": "Leptófilas/nanófilas (<4 cm²)",
        "fr": "Leptophylles/nanophylles (<4 cm²)"
      }
    }
  ],
  "life_forms": {
    "woody": [
      {
        "id": "B",
        "label": "B",
        "name": {
          "pt": "Lenhosa Sempreverde",
          "en": "Evergreen Woody",
          "es": "Leñosa Perennifolia",
          "fr": "Ligneuse Sempervirente"
        },
        "desc": {
          "pt": "Folhas largas perenes",
          "en": "Broad perennial leaves",
          "es": "Hojas anchas perennes",
          "fr": "Feuilles larges pérennes"
        }
      },
      {
        "id": "D",
        "label": "D",
        "name": {
          "pt": "Lenhosa Decídua",
          "en": "Deciduous Woody",
          "es": "Leñosa Decidua",
          "fr": "Ligneuse Décidue"
        },
        "desc": {
          "pt": "Perde folhas na seca",
          "en": "Loses leaves in dry season",
          "es": "Pierde hojas en sequía",
          "fr": "Perd ses feuilles en saison sèche"
        }
      },
      {
        "id": "E",
        "label": "E",
        "name": {
          "pt": "Lenhosa Aciculifoliada",
          "en": "Needle-leaved Woody",
          "es": "Leñosa Aciculifoliada",
          "fr": "Ligneuse Aciculifoliée"
        },
        "desc": {
          "pt": "Folhas em agulha (Pinus)",
          "en": "Needle leaves (Pine)",
          "es": "Hojas en aguja (Pino)",
          "fr": "Feuilles en aiguilles (Pin)"
        }
      },
      {
        "id": "N",
        "label": "N",
        "name": {
          "pt": "Acículas Decíduas",
          "en": "Deciduous Needles",
          "es": "Acículas Deciduas",
          "fr": "Aiguilles Décidues"
        },
        "desc": {
          "pt": "Folhas em agulha, caem na seca (ex: Lariços)",
          "en": "Needle leaves that fall in dry season (e.g. Larches)",
          "es": "Hojas en aguja, caen en sequía (ej: Alerces)",
          "fr": "Feuilles en aiguilles qui tombent en saison sèche (ex. : Mélèzes)"
        }
      },
      {
        "id": "O",
        "label": "O",
        "name": {
          "pt": "Áfilas",
          "en": "Aphyllous",
          "es": "Áfilas",
          "fr": "Aphylles"
        },
        "desc": {
          "pt": "Sem folhas ou folhas reduzidas; clorofila no caule (ex: Casuarinas)",
          "en": "Without leaves or reduced leaves; chlorophyll in stem (e.g. Casuarinas)",
          "es": "Sin hojas o hojas reducidas; clorofila en el tallo (ej: Casuarinas)",
          "fr": "Sans feuilles ou feuilles réduites ; chlorophylle dans la tige (ex. : Casuarinas)"
        }
      },
      {
        "id": "S",
        "label": "S",
        "name": {
          "pt": "Semidecíduas",
          "en": "Semi-deciduous",
          "es": "Semideciduas",
          "fr": "Semi-décidues"
        },
        "desc": {
          "pt": "Misto de B e D (onde a menor classe cobre ao menos 25%)",
          "en": "Mix of B and D (where the smaller class covers at least 25%)",
          "es": "Mezcla de B y D (donde la clase menor cubre al menos 25%)",
          "fr": "Mélange de B et D (où la classe minoritaire couvre au moins 25 %)"
        }
      },
      {
        "id": "M",
        "label": "M",
        "name": {
          "pt": "Mistas",
          "en": "Mixed",
          "es": "Mixtas",
          "fr": "Mixtes"
        },
        "desc": {
          "pt": "Misto de E e D ou Latifoliadas + Aciculifoliadas",
          "en": "Mix of E and D or Broadleaved + Needleleaved",
          "es": "Mezcla de E y D o Latifoliadas + Aciculifoliadas",
          "fr": "Mélange de E et D ou Feuillus + Résineux"
        }
      }
    ],
    "herbaceous": [
      {
        "id": "G",
        "label": "G",
        "name": {
          "pt": "Graminoides",
          "en": "Graminoids",
          "es": "Graminoides",
          "fr": "Graminoïdes"
        },
        "desc": {
          "pt": "Gramíneas e ciperáceas",
          "en": "Grasses and sedges",
          "es": "Gramíneas y ciperáceas",
          "fr": "Graminées et cypéracées"
        }
      },
      {
        "id": "H",
        "label": "H",
        "name": {
          "pt": "Latifoliadas",
          "en": "Broad-leaved",
          "es": "Latifoliadas",
          "fr": "Feuillus"
        },
        "desc": {
          "pt": "Ervas de folhas largas",
          "en": "Broad-leaved herbs",
          "es": "Hierbas de hojas anchas",
          "fr": "Herbes à larges feuilles"
        }
      },
      {
        "id": "L",
        "label": "L",
        "name": {
          "pt": "Liquens/Musgos",
          "en": "Lichens/Mosses",
          "es": "Líquenes/Musgos",
          "fr": "Lichens/Mousses"
        },
        "desc": {
          "pt": "Tapetes no solo",
          "en": "Ground carpets",
          "es": "Alfombras en el suelo",
          "fr": "Tapis au sol"
        }
      }
    ],
    "special": [
      {
        "id": "C",
        "label": "C",
        "name": {
          "pt": "Lianas",
          "en": "Lianas",
          "es": "Lianas",
          "fr": "Lianes"
        },
        "desc": {
          "pt": "Trepadeiras de caule lenhoso (cipós)",
          "en": "Woody-stemmed climbers (vines)",
          "es": "Trepadoras de tallo leñoso (bejucos)",
          "fr": "Grimpantes à tige ligneuse (lianes)"
        }
      },
      {
        "id": "K",
        "label": "K",
        "name": {
          "pt": "Caule Suculento",
          "en": "Succulent Stem",
          "es": "Tallo Suculento",
          "fr": "Tige Succulente"
        },
        "desc": {
          "pt": "Cactos colunares, mandacaru, facheiro",
          "en": "Columnar cacti, mandacaru, facheiro",
          "es": "Cactus columnares, mandacaru, facheiro",
          "fr": "Cactus columnaires, mandacaru, facheiro"
        }
      },
      {
        "id": "T",
        "label": "T",
        "name": {
          "pt": "Plantas Tufadas",
          "en": "Tufted Plants",
          "es": "Plantas Amacolladas",
          "fr": "Plantes en Touffe"
        },
        "desc": {
          "pt": "Folhas em tufos no ápice, sem galhos (ex: Palmeiras)",
          "en": "Leaves in tufts at apex, no branches (e.g. Palms)",
          "es": "Hojas en penachos en el ápice, sin ramas (ej: Palmeras)",
          "fr": "Feuilles en touffes au sommet, sans branches (ex. : Palmiers)"
        }
      },
      {
        "id": "V",
        "label": "V",
        "name": {
          "pt": "Bambus",
          "en": "Bamboos",
          "es": "Bambúes",
          "fr": "Bambous"
        },
        "desc": {
          "pt": "Graminoides de caule lenhoso",
          "en": "Woody-stemmed graminoids",
          "es": "Graminoides de tallo leñoso",
          "fr": "Graminoïdes à tige ligneuse"
        }
      },
      {
        "id": "X",
        "label": "X",
        "name": {
          "pt": "Epífitas",
          "en": "Epiphytes",
          "es": "Epífitas",
          "fr": "Épiphytes"
        },
        "desc": {
          "pt": "Crescem sobre outras plantas (ex: Bromélias)",
          "en": "Grow on other plants (e.g. Bromeliads)",
          "es": "Crecen sobre otras plantas (ej: Bromelias)",
          "fr": "Poussent sur d'autres plantes (ex. : Broméliacées)"
        }
      }
    ]
  }
};
