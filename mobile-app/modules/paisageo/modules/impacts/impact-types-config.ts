// Full widget configuration for the impacts field (impact types with
// per-type help text and per-type-per-magnitude descriptions, magnitude
// options, helper/section text). Ported from the legacy
// assets/protocols/paisageo/paisageo_protocol.json so the impacts module no
// longer depends on that asset directly (Fase 1 of the plugin-architecture
// migration). ImpactList.tsx consumes this shape as-is (field.options,
// field.config.magnitude_options, field.desc, field.helper_text).

export const IMPACTS_FIELD_CONFIG = {
  "key": "environmental_impacts",
  "label": {
    "pt": "Impactos Ambientais",
    "en": "Environmental Impacts",
    "es": "Impactos Ambientales",
    "fr": "Impacts Environnementaux"
  },
  "type": "impact_list",
  "helper_text": {
    "pt": "Selecione os impactos observados e adicione detalhes se necessário.",
    "en": "Select observed impacts and add details if necessary.",
    "es": "Seleccione los impactos observados y agregue detalles si es necesario.",
    "fr": "Sélectionnez les impacts observés et ajoutez des détails si nécessaire."
  },
  "options": [
    {
      "key": "pollution",
      "label": {
        "pt": "Poluição",
        "en": "Pollution",
        "es": "Contaminación",
        "fr": "Pollution"
      },
      "desc": {
        "pt": "Contaminação do solo, água ou ar por resíduos, químicos ou dejetos",
        "en": "Contamination of soil, water or air by waste, chemicals or effluents",
        "es": "Contaminación del suelo, agua o aire por residuos, químicos o efluentes",
        "fr": "Contamination du sol, de l'eau ou de l'air par des déchets, des produits chimiques ou des effluents"
      },
      "magnitude_desc": [
        {
          "pt": "Resíduos dispersos pontualmente; impacto localizado e reversível a curto prazo.",
          "en": "Scattered waste; localized and reversible impact in the short term.",
          "es": "Residuos dispersos puntualmente; impacto localizado y reversible a corto plazo.",
          "fr": "Déchets dispersés ponctuellement ; impact localisé et réversible à court terme."
        },
        {
          "pt": "Contaminação difusa visível; indícios de toxicidade na vegetação ou no solo.",
          "en": "Visible diffuse contamination; signs of toxicity in vegetation or soil.",
          "es": "Contaminación difusa visible; indicios de toxicidad en la vegetación o el suelo.",
          "fr": "Contamination diffuse visible ; signes de toxicité dans la végétation ou le sol."
        },
        {
          "pt": "Passivo ambiental grave; solo ou água visivelmente comprometidos — recuperação improvável sem intervenção.",
          "en": "Severe environmental liability; soil or water visibly compromised — recovery unlikely without intervention.",
          "es": "Pasivo ambiental grave; suelo o agua visiblemente comprometidos — recuperación improbable sin intervención.",
          "fr": "Passif environnemental grave ; sol ou eau visiblement compromis — récupération improbable sans intervention."
        }
      ]
    },
    {
      "key": "erosion",
      "label": {
        "pt": "Erosão",
        "en": "Erosion",
        "es": "Erosión",
        "fr": "Érosion"
      },
      "desc": {
        "pt": "Perda de solo por ação da água, vento ou gravidade; formação de sulcos e ravinas",
        "en": "Soil loss by water, wind or gravity action; formation of gullies and ravines",
        "es": "Pérdida de suelo por acción del agua, viento o gravedad; formación de surcos y cárcavas",
        "fr": "Perte de sol par l'action de l'eau, du vent ou de la gravité ; formation de ravines et de ravinements"
      },
      "magnitude_desc": [
        {
          "pt": "Sulcos superficiais incipientes (< 10 cm); remoção laminar pontual do horizonte superficial.",
          "en": "Incipient shallow rills (< 10 cm); localized sheet removal of the topsoil.",
          "es": "Surcos superficiales incipientes (< 10 cm); remoción laminar puntual del horizonte superficial.",
          "fr": "Rigoles superficielles incipientes (< 10 cm) ; enlèvement lamellaire localisé de la couche superficielle."
        },
        {
          "pt": "Ravinas ativas com sulcos 10–50 cm; perda expressiva do horizonte A; assoreamento de drenagens.",
          "en": "Active gullies 10–50 cm deep; significant loss of A horizon; drainage siltation.",
          "es": "Cárcavas activas de 10–50 cm; pérdida significativa del horizonte A; colmatación de drenajes.",
          "fr": "Ravines actives de 10 à 50 cm de profondeur ; perte significative de l'horizon A ; envasement des drains."
        },
        {
          "pt": "Voçorocamento — sulcos > 50 cm ou colapso de encosta; exposição de horizontes B/C ou rocha.",
          "en": "Gullying — channels > 50 cm or slope collapse; exposure of B/C horizons or bedrock.",
          "es": "Cárcavas profundas > 50 cm o colapso de ladera; exposición de horizontes B/C o roca madre.",
          "fr": "Ravinement — chenaux > 50 cm ou effondrement de versant ; exposition des horizons B/C ou de la roche mère."
        }
      ]
    },
    {
      "key": "invasive_species",
      "label": {
        "pt": "Espécies invasoras",
        "en": "Invasive species",
        "es": "Especies invasoras",
        "fr": "Espèces invasives"
      },
      "desc": {
        "pt": "Presença de espécies exóticas que competem e ameaçam a vegetação nativa",
        "en": "Presence of exotic species that compete with and threaten native vegetation",
        "es": "Presencia de especies exóticas que compiten y amenazan la vegetación nativa",
        "fr": "Présence d'espèces exotiques qui concurrencent et menacent la végétation native"
      },
      "magnitude_desc": [
        {
          "pt": "Presença pontual sem dominância; cobertura de invasoras < 25% — regeneração nativa não comprometida.",
          "en": "Scattered presence without dominance; invasive cover < 25% — native regeneration not compromised.",
          "es": "Presencia puntual sin dominancia; cobertura de invasoras < 25% — regeneración nativa no comprometida.",
          "fr": "Présence ponctuelle sans dominance ; couverture des invasives < 25 % — régénération native non compromise."
        },
        {
          "pt": "Co-dominância com espécies nativas; cobertura 25–75% — regeneração natural dificultada.",
          "en": "Co-dominance with native species; cover 25–75% — natural regeneration hindered.",
          "es": "Co-dominancia con especies nativas; cobertura 25–75% — regeneración natural dificultada.",
          "fr": "Co-dominance avec les espèces natives ; couverture 25–75 % — régénération naturelle entravée."
        },
        {
          "pt": "Dominância total; cobertura > 75% — regeneração nativa suprimida, intervenção necessária.",
          "en": "Total dominance; cover > 75% — native regeneration suppressed, intervention required.",
          "es": "Dominancia total; cobertura > 75% — regeneración nativa suprimida, intervención necesaria.",
          "fr": "Dominance totale ; couverture > 75 % — régénération native supprimée, intervention nécessaire."
        }
      ]
    },
    {
      "key": "fire",
      "label": {
        "pt": "Fogo",
        "en": "Fire",
        "es": "Fuego",
        "fr": "Feu"
      },
      "desc": {
        "pt": "Queimadas recentes ou antigas; evidências de incêndios florestais",
        "en": "Recent or old burns; evidence of forest fires",
        "es": "Quemas recientes o antiguas; evidencias de incendios forestales",
        "fr": "Brûlages récents ou anciens ; traces d'incendies de forêt"
      },
      "magnitude_desc": [
        {
          "pt": "Fogo de baixa intensidade; danos restritos ao estrato herbáceo — troncos e copa intactos.",
          "en": "Low-intensity fire; damage restricted to the herbaceous layer — trunks and crown intact.",
          "es": "Fuego de baja intensidad; daños restringidos al estrato herbáceo — troncos y copa intactos.",
          "fr": "Feu de faible intensité ; dommages limités à la strate herbacée — troncs et couronnes intacts."
        },
        {
          "pt": "Queimada de média intensidade; danos ao sub-bosque e arbustos; troncos chamuscados mas vivos.",
          "en": "Medium-intensity fire; damage to understorey and shrubs; scorched but living trunks.",
          "es": "Quema de media intensidad; daños en el sotobosque y arbustos; troncos chamuscados pero vivos.",
          "fr": "Feu de moyenne intensité ; dommages au sous-bois et aux arbustes ; troncs calcinés mais vivants."
        },
        {
          "pt": "Incêndio de alta intensidade; mortalidade de árvores e colapso do dossel; solo exposto.",
          "en": "High-intensity wildfire; tree mortality and canopy collapse; exposed soil.",
          "es": "Incendio de alta intensidad; mortalidad de árboles y colapso del dosel; suelo expuesto.",
          "fr": "Incendie de haute intensité ; mortalité des arbres et effondrement de la canopée ; sol exposé."
        }
      ]
    },
    {
      "key": "frost",
      "label": {
        "pt": "Geada",
        "en": "Frost",
        "es": "Helada",
        "fr": "Gel"
      },
      "desc": {
        "pt": "Danos à vegetação causados por temperaturas abaixo de zero",
        "en": "Damage to vegetation caused by below-zero temperatures",
        "es": "Daños a la vegetación causados por temperaturas bajo cero",
        "fr": "Dommages à la végétation causés par des températures inférieures à zéro"
      },
      "magnitude_desc": [
        {
          "pt": "Danos foliares pontuais em espécies sensíveis; estrutura e estrato lenhoso intactos.",
          "en": "Localised foliar damage in sensitive species; structure and woody layer intact.",
          "es": "Daños foliares puntuales en especies sensibles; estructura y estrato leñoso intactos.",
          "fr": "Dommages foliaires localisés chez les espèces sensibles ; structure et strate ligneuse intactes."
        },
        {
          "pt": "Necrose de ramos e parte aérea; retardo no desenvolvimento; seca de ponteiros evidente.",
          "en": "Branch and shoot necrosis; delayed development; evident dieback of tips.",
          "es": "Necrosis de ramas y parte aérea; retraso en el desarrollo; seca de puntas evidente.",
          "fr": "Nécrose des branches et des pousses ; développement ralenti ; dépérissement des extrémités évident."
        },
        {
          "pt": "Mortalidade de indivíduos; comprometimento generalizado da comunidade vegetal.",
          "en": "Individual plant mortality; widespread impairment of the plant community.",
          "es": "Mortalidad de individuos; compromiso generalizado de la comunidad vegetal.",
          "fr": "Mortalité d'individus ; atteinte généralisée de la communauté végétale."
        }
      ]
    },
    {
      "key": "mining",
      "label": {
        "pt": "Mineração",
        "en": "Mining",
        "es": "Minería",
        "fr": "Extraction Minière"
      },
      "desc": {
        "pt": "Extração de minerais; áreas degradadas por atividade mineral ou de exploração",
        "en": "Mineral extraction; areas degraded by mining or exploration activities",
        "es": "Extracción de minerales; áreas degradadas por actividad minera o de explotación",
        "fr": "Extraction de minéraux ; zones dégradées par des activités d'extraction ou d'exploration minière"
      },
      "magnitude_desc": [
        {
          "pt": "Extração localizada < 5% da área; cicatrizes superficiais com potencial de recolonização natural.",
          "en": "Localised extraction < 5% of the area; surface scars with natural recolonisation potential.",
          "es": "Extracción localizada < 5% del área; cicatrices superficiales con potencial de recolonización natural.",
          "fr": "Extraction localisée < 5 % de la zone ; cicatrices superficielles avec potentiel de recolonisation naturelle."
        },
        {
          "pt": "Cavas e pilhas de rejeito evidentes; instabilidade de encostas; cobertura vegetal > 50% suprimida.",
          "en": "Visible pits and waste piles; slope instability; vegetation cover > 50% suppressed.",
          "es": "Cavas y pilas de residuos evidentes; inestabilidad de taludes; cobertura vegetal > 50% suprimida.",
          "fr": "Excavations et haldes visibles ; instabilité des versants ; couvert végétal > 50 % supprimé."
        },
        {
          "pt": "Degradação total do solo e vegetação na área; sem potencial de recuperação natural.",
          "en": "Total soil and vegetation degradation in the area; no natural recovery potential.",
          "es": "Degradación total del suelo y la vegetación en el área; sin potencial de recuperación natural.",
          "fr": "Dégradation totale du sol et de la végétation dans la zone ; aucun potentiel de récupération naturelle."
        }
      ]
    },
    {
      "key": "drought",
      "label": {
        "pt": "Seca",
        "en": "Drought",
        "es": "Sequía",
        "fr": "Sécheresse"
      },
      "desc": {
        "pt": "Estresse hídrico prolongado; sinais de déficit de água na vegetação",
        "en": "Prolonged water stress; signs of water deficit in vegetation",
        "es": "Estrés hídrico prolongado; signos de déficit de agua en la vegetación",
        "fr": "Stress hydrique prolongé ; signes de déficit hydrique dans la végétation"
      },
      "magnitude_desc": [
        {
          "pt": "Murcha reversível e folhagem amarelada em espécies sensíveis; sem mortalidade observada.",
          "en": "Reversible wilting and yellowing foliage in sensitive species; no mortality observed.",
          "es": "Marchitamiento reversible y follaje amarillento en especies sensibles; sin mortalidad observada.",
          "fr": "Flétrissement réversible et jaunissement du feuillage chez les espèces sensibles ; aucune mortalité observée."
        },
        {
          "pt": "Desfolhamento precoce e seca de ponteiros; estresse generalizado; cursos d'água intermitentes.",
          "en": "Early leaf drop and dieback of tips; widespread stress; intermittent water courses.",
          "es": "Defoliación prematura y seca de puntas; estrés generalizado; cursos de agua intermitentes.",
          "fr": "Chute précoce des feuilles et dépérissement des extrémités ; stress généralisé ; cours d'eau intermittents."
        },
        {
          "pt": "Mortalidade de indivíduos e colapso da cobertura vegetal; solo exposto por ressecamento.",
          "en": "Individual mortality and vegetation cover collapse; soil exposed by desiccation.",
          "es": "Mortalidad de individuos y colapso de la cobertura vegetal; suelo expuesto por desecación.",
          "fr": "Mortalité d'individus et effondrement du couvert végétal ; sol exposé par dessiccation."
        }
      ]
    },
    {
      "key": "overgrazing",
      "label": {
        "pt": "Sobrepastoreio",
        "en": "Overgrazing",
        "es": "Sobrepastoreo",
        "fr": "Surpâturage"
      },
      "desc": {
        "pt": "Danos por pastagem excessiva de animais; compactação e perda de cobertura vegetal",
        "en": "Damage from excessive animal grazing; compaction and loss of vegetation cover",
        "es": "Daños por pastoreo excesivo de animales; compactación y pérdida de cobertura vegetal",
        "fr": "Dommages dus au surpâturage animal ; compaction et perte du couvert végétal"
      },
      "magnitude_desc": [
        {
          "pt": "Pressão leve; cobertura herbácea preservada com sinais pontuais de pisoteio.",
          "en": "Light pressure; herbaceous cover preserved with localised signs of trampling.",
          "es": "Presión leve; cobertura herbácea preservada con señales puntuales de pisoteo.",
          "fr": "Pression légère ; couvert herbacé préservé avec signes localisés de piétinement."
        },
        {
          "pt": "Cobertura herbácea reduzida > 50%; compactação superficial visível; trilhas de gado frequentes.",
          "en": "Herbaceous cover reduced > 50%; visible surface compaction; frequent cattle trails.",
          "es": "Cobertura herbácea reducida > 50%; compactación superficial visible; senderos de ganado frecuentes.",
          "fr": "Couvert herbacé réduit > 50 % ; compaction superficielle visible ; sentiers de bétail fréquents."
        },
        {
          "pt": "Solo compactado e nu com crostas superficiais; ausência de regeneração; erosão laminar incipiente.",
          "en": "Compacted bare soil with surface crusts; no regeneration; incipient sheet erosion.",
          "es": "Suelo compactado y desnudo con costras superficiales; ausencia de regeneración; erosión laminar incipiente.",
          "fr": "Sol nu compacté avec croûtes superficielles ; absence de régénération ; érosion en nappe incipiente."
        }
      ]
    },
    {
      "key": "burial",
      "label": {
        "pt": "Soterramento",
        "en": "Burial",
        "es": "Enterramiento",
        "fr": "Enfouissement"
      },
      "desc": {
        "pt": "Deposição excessiva de sedimentos sobre a vegetação; assoreamento",
        "en": "Excessive sediment deposition over vegetation; sedimentation",
        "es": "Deposición excesiva de sedimentos sobre la vegetación; sedimentación",
        "fr": "Dépôt excessif de sédiments sur la végétation ; sédimentation"
      },
      "magnitude_desc": [
        {
          "pt": "Deposição fina < 5 cm; vegetação adaptada ou em recuperação espontânea.",
          "en": "Fine deposition < 5 cm; vegetation adapted or in spontaneous recovery.",
          "es": "Deposición fina < 5 cm; vegetación adaptada o en recuperación espontánea.",
          "fr": "Dépôt fin < 5 cm ; végétation adaptée ou en récupération spontanée."
        },
        {
          "pt": "Camada de sedimentos 5–20 cm; soterramento parcial de indivíduos; assoreamento de drenagens.",
          "en": "Sediment layer 5–20 cm; partial burial of individuals; drainage siltation.",
          "es": "Capa de sedimentos 5–20 cm; enterramiento parcial de individuos; colmatación de drenajes.",
          "fr": "Couche de sédiments 5–20 cm ; enfouissement partiel d'individus ; envasement des drains."
        },
        {
          "pt": "Espessura > 20 cm; soterramento total de indivíduos com mortalidade generalizada.",
          "en": "Thickness > 20 cm; total burial of individuals with widespread mortality.",
          "es": "Espesor > 20 cm; enterramiento total de individuos con mortalidad generalizada.",
          "fr": "Épaisseur > 20 cm ; enfouissement total d'individus avec mortalité généralisée."
        }
      ]
    },
    {
      "key": "vegetation_removal",
      "label": {
        "pt": "Supressão vegetal",
        "en": "Vegetation removal",
        "es": "Supresión vegetal",
        "fr": "Suppression végétale"
      },
      "desc": {
        "pt": "Remoção ou corte intencional da vegetação; desmatamento e limpeza de terreno",
        "en": "Intentional removal or cutting of vegetation; deforestation and land clearing",
        "es": "Remoción o corte intencional de la vegetación; deforestación y limpieza de terreno",
        "fr": "Enlèvement ou coupe intentionnelle de la végétation ; déforestation et défrichement"
      },
      "magnitude_desc": [
        {
          "pt": "Corte seletivo de espécies; estrutura e dossel preservados — sem alteração fisionômica significativa.",
          "en": "Selective cutting of species; structure and canopy preserved — no significant physiognomic change.",
          "es": "Corte selectivo de especies; estructura y dosel preservados — sin alteración fisionómica significativa.",
          "fr": "Coupe sélective d'espèces ; structure et canopée préservées — pas de changement physionomique significatif."
        },
        {
          "pt": "Abertura de clareiras > 20% da área; estrutura parcialmente comprometida; sub-bosque exposto.",
          "en": "Clearings > 20% of the area; structure partially compromised; understorey exposed.",
          "es": "Apertura de claros > 20% del área; estructura parcialmente comprometida; sotobosque expuesto.",
          "fr": "Trouées > 20 % de la zone ; structure partiellement compromise ; sous-bois exposé."
        },
        {
          "pt": "Remoção total da cobertura vegetal; solo exposto; perda irreversível da estrutura fisionômica.",
          "en": "Total removal of vegetation cover; bare soil; irreversible loss of physiognomic structure.",
          "es": "Remoción total de la cobertura vegetal; suelo expuesto; pérdida irreversible de la estructura fisionómica.",
          "fr": "Suppression totale du couvert végétal ; sol nu ; perte irréversible de la structure physionomique."
        }
      ]
    }
  ],
  "config": {
    "magnitude_options": [
      {
        "value": "occasional",
        "pt": "Ocasional",
        "en": "Occasional",
        "es": "Ocasional",
        "fr": "Occasionnel"
      },
      {
        "value": "common",
        "pt": "Comum",
        "en": "Common",
        "es": "Común",
        "fr": "Courant"
      },
      {
        "value": "critical",
        "pt": "Crítico",
        "en": "Critical",
        "es": "Crítico",
        "fr": "Critique"
      }
    ]
  },
  "desc": {
    "pt": "Registro das perturbações de origem antrópica ou natural que afetam o estado atual da unidade de paisagem. Os impactos e suas magnitudes são utilizados pelo algoritmo de nomenclatura autônoma do Nomos para qualificar o estado evolutivo da paisagem (progressivo ou regressivo) na designação padronizada da unidade.",
    "en": "Record of anthropic or natural disturbances affecting the current state of the landscape unit. Impacts and their magnitudes are used by the Nomos autonomous naming algorithm to qualify the evolutionary state of the landscape (progressive or regressive) in the standardized unit designation.",
    "es": "Registro de las perturbaciones de origen antrópico o natural que afectan el estado actual de la unidad de paisaje. Los impactos y sus magnitudes son utilizados por el algoritmo de denominación autónoma de Nomos para calificar el estado evolutivo del paisaje (progresivo o regresivo) en la designación estandarizada de la unidad.",
    "fr": "Relevé des perturbations d'origine anthropique ou naturelle affectant l'état actuel de l'unité de paysage. Les impacts et leurs magnitudes sont utilisés par l'algorithme de dénomination autonome de Nomos pour qualifier l'état évolutif du paysage (progressif ou régressif) dans la désignation standardisée de l'unité."
  }
};
