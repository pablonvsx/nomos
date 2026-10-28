// Interface strings and language handling for the Nomos landing page. Loaded in the browser
// (window.NomosI18n) and in Node (module.exports). The static HTML is Portuguese and works
// without this script; the content of the citations is never translated.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.NomosI18n = factory(root);
})(this, function (root) {
  'use strict';

  var DEFAULT_LOCALE = 'pt-BR';
  var LOCALES = ['pt-BR', 'en', 'es', 'fr'];
  var STORAGE_KEY = 'nomos-lang';
  var OG_LOCALES = { 'pt-BR': 'pt_BR', en: 'en_US', es: 'es_ES', fr: 'fr_FR' };
  var INTL_LOCALES = { 'pt-BR': 'pt-BR', en: 'en-GB', es: 'es', fr: 'fr' };

  // One URL per language; a null entry falls back to the Portuguese guide.
  var GUIDE_URLS = {
    'pt-BR': 'https://docs.google.com/document/d/14M19dZIUNGjFN2J7mU_xN3LT13nbuIot/edit',
    en: null,
    es: null,
    fr: null
  };

  var DICT = {
    'pt-BR': {
      'meta.title': 'Nomos | Aplicativo para inventários ambientais: download, autoria e citação',
      'meta.description': 'Nomos é um aplicativo móvel para inventários ambientais, desenvolvido no PPGEO da UFPE. Baixe o APK para Android, conheça a autoria e a vinculação acadêmica e veja como citar o software.',
      'meta.ogTitle': 'Nomos | Aplicativo para inventários ambientais',
      'meta.ogDescription': 'Baixe o aplicativo Nomos para Android, conheça a autoria e a vinculação acadêmica e veja como citar o software em ABNT, APA, Vancouver, IEEE, MLA, Chicago, BibTeX e RIS.',
      'logo.alt': 'Logo do Nomos',
      'lang.label': 'Idioma',
      'skip.link': 'Ir para o conteúdo',
      'a11y.newTab': ' (abre em nova aba)',
      'hero.lead': 'Aplicativo móvel para inventários ambientais',
      'download.title': 'Baixar o Nomos',
      'download.button': 'Baixar para Android',
      'download.allVersions': 'Ver todas as versões',
      'version.line': 'Versão {version} · publicada em {date}',
      'version.lineNoDate': 'Versão {version}',
      'version.fallback': 'Última versão publicada',
      'install.summary': 'Como instalar',
      'install.step1': 'Toque em <strong>Baixar para Android</strong> e aguarde o arquivo ser baixado.',
      'install.step2': 'O navegador pode avisar que o arquivo pode ser prejudicial. Isso é comum em aplicativos instalados fora da loja. Escolha manter o download.',
      'install.step3': 'Abra o arquivo baixado.',
      'install.step4': 'O Android pode pedir permissão para o navegador instalar aplicativos de fontes desconhecidas. Autorize somente para esta instalação.',
      'install.step5': 'Conclua a instalação.',
      'about.title': 'O que é o Nomos',
      'about.text': 'O Nomos apoia inventários ambientais. Em sua versão inicial, implementa um protocolo de cartografia da paisagem desenvolvido no PPGEO da UFPE, servindo como intermediário <span class="nowrap">técnico-metodológico</span> para substituir registros analógicos por um fluxo digital estruturado, padronizado e reprodutível. O aplicativo também permite usar protocolos mais simples, criados pelo próprio usuário.',
      'about.f1': '<strong>Coleta offline.</strong> Os registros ficam salvos no próprio aparelho, sem exigir conexão em campo.',
      'about.f2': '<strong>Classificação fisionômica automatizada.</strong> Gera a fórmula de vegetação segundo o sistema de Küchler.',
      'about.f3': '<strong>Nomenclatura padronizada da paisagem.</strong> Compõe o nome da unidade a partir dos atributos observados em campo.',
      'about.f4': '<strong>Arquitetura modular de protocolos.</strong> O protocolo de referência é um módulo entre outros, e é possível criar protocolos personalizados.',
      'about.f5': '<strong>Exportação estruturada.</strong> Gera dados em GeoJSON e CSV, com as mídias de campo em um arquivo compactado.',
      'about.f6': '<strong>Backup e colaboração pelo Google Drive.</strong> Mantenha cópias de segurança dos seus registros e compartilhe o trabalho com a equipe.',
      'guide.title': 'Guia e tutoriais',
      'guide.itemTitle': 'Guia prático de uso',
      'guide.meta': 'Versão 1.0 · agosto de 2026',
      'guide.text': 'Orientações práticas para usar o aplicativo nos inventários ambientais em campo.',
      'guide.open': 'Abrir guia',
      'guide.onlyPt': 'O guia está disponível, por enquanto, apenas em português.',
      'authors.title': 'Autoria',
      'authors.author': 'Autor',
      'authors.advisor': 'Orientador',
      'affil.title': 'Vinculação e apoio institucional',
      'affil.text': 'O Nomos é um produto tecnológico desenvolvido em pesquisa de mestrado vinculada ao Programa de <span class="nowrap">Pós-Graduação</span> em Geografia (PPGEO) da Universidade Federal de Pernambuco (UFPE). A pesquisa tem afiliação científica ao Laboratório de Pesquisa em Dinâmicas de Paisagens Intertropicais (INTERTRÓPICOS) e ao Grupo de Pesquisa em Geografia e Conservação em Paisagens Tropicais (PAISAGEO).',
      'affil.capes': 'A pesquisa conta com o apoio da Coordenação de Aperfeiçoamento de Pessoal de Nível Superior (CAPES).',
      'affil.site': 'Site',
      'affil.page': 'Página',
      'affil.social': 'Rede social',
      'logo.ufpe': 'Logo da Universidade Federal de Pernambuco',
      'logo.capes': 'Logo da Coordenação de Aperfeiçoamento de Pessoal de Nível Superior (CAPES)',
      'logo.ppgeo': 'Logo do Programa de Pós-Graduação em Geografia (PPGEO) da UFPE',
      'logo.intertropicos': 'Logo do Laboratório de Pesquisa em Dinâmicas de Paisagens Intertropicais (INTERTRÓPICOS)',
      'logo.paisageo': 'Logo do Grupo de Pesquisa em Geografia e Conservação em Paisagens Tropicais (PAISAGEO)',
      'cite.title': 'Como citar',
      'cite.intro': 'Para citar o Nomos como software, use a referência abaixo.',
      'cite.label': 'Formato da citação',
      'cite.chicago': 'Chicago (autor-data)',
      'cite.copy': 'Copiar referência',
      'cite.copied': 'Referência copiada',
      'cite.copyFailed': 'Não foi possível copiar',
      'cite.note': 'Referências geradas automaticamente. Confira as normas da revista ou da instituição.',
      'cite.noteGeneric': 'Esta referência cita o Nomos sem indicar versão e usa o DOI de todas as versões, que aponta sempre para a mais recente. Para citar uma versão específica, use o DOI dela no <a href="{url}" target="_blank" rel="noopener noreferrer">registro do Zenodo<span class="visually-hidden"> (abre em nova aba)</span></a>.',
      'cite.noteVersion': 'Esta referência cita a versão <span data-cite-version></span> do Nomos e usa o DOI dessa versão. Para citar o software em geral, sem indicar versão, use o DOI de todas as versões: <a href="{url}" target="_blank" rel="noopener noreferrer">{doi}<span class="visually-hidden"> (abre em nova aba)</span></a>.',
      'code.title': 'Código e licença',
      'code.text': 'O código do Nomos está aberto e é distribuído sob a licença GNU GPL v3.',
      'code.button': 'Repositório no GitHub'
    },
    en: {
      'meta.title': 'Nomos | App for environmental inventories: download, authorship and citation',
      'meta.description': 'Nomos is a mobile app for environmental inventories, developed at the PPGEO of UFPE. Download the Android APK, learn about the authorship and academic affiliation, and see how to cite the software.',
      'meta.ogTitle': 'Nomos | App for environmental inventories',
      'meta.ogDescription': 'Download the Nomos app for Android, learn about the authorship and academic affiliation, and see how to cite the software in ABNT, APA, Vancouver, IEEE, MLA, Chicago, BibTeX and RIS.',
      'logo.alt': 'Nomos logo',
      'lang.label': 'Language',
      'skip.link': 'Skip to content',
      'a11y.newTab': ' (opens in a new tab)',
      'hero.lead': 'Mobile app for environmental inventories',
      'download.title': 'Download Nomos',
      'download.button': 'Download for Android',
      'download.allVersions': 'View all versions',
      'version.line': 'Version {version} · published on {date}',
      'version.lineNoDate': 'Version {version}',
      'version.fallback': 'Latest published version',
      'install.summary': 'How to install',
      'install.step1': 'Tap <strong>Download for Android</strong> and wait for the file to finish downloading.',
      'install.step2': 'Your browser may warn that the file could be harmful. This is common for apps installed outside the store. Choose to keep the download.',
      'install.step3': 'Open the downloaded file.',
      'install.step4': 'Android may ask for permission for the browser to install apps from unknown sources. Allow it only for this installation.',
      'install.step5': 'Complete the installation.',
      'about.title': 'What is Nomos',
      'about.text': 'Nomos supports environmental inventories. In its initial version, it implements a landscape mapping protocol developed at the PPGEO of UFPE, serving as a <span class="nowrap">technical-methodological</span> intermediary to replace analog records with a structured, standardized and reproducible digital workflow. The app also lets users apply simpler protocols created by the users themselves.',
      'about.f1': '<strong>Offline collection.</strong> Records are saved on the device itself, with no connection required in the field.',
      'about.f2': '<strong>Automated physiognomic classification.</strong> Generates the vegetation formula according to Küchler\'s system.',
      'about.f3': '<strong>Standardized landscape nomenclature.</strong> Builds the unit name from the attributes observed in the field.',
      'about.f4': '<strong>Modular protocol architecture.</strong> The reference protocol is one module among others, and custom protocols can be created.',
      'about.f5': '<strong>Structured export.</strong> Generates data in GeoJSON and CSV, with field media in a compressed archive.',
      'about.f6': '<strong>Backup and collaboration through Google Drive.</strong> Keep backup copies of your records and share your work with your team.',
      'guide.title': 'Guides and tutorials',
      'guide.itemTitle': 'Practical user guide',
      'guide.meta': 'Version 1.0 · August 2026',
      'guide.text': 'Practical guidance for using the app in environmental field inventories.',
      'guide.open': 'Open guide',
      'guide.onlyPt': 'The guide is currently available only in Portuguese.',
      'authors.title': 'Authorship',
      'authors.author': 'Author',
      'authors.advisor': 'Advisor',
      'affil.title': 'Affiliation and institutional support',
      'affil.text': 'Nomos is a technological product developed within master\'s research linked to the Graduate Program in Geography (PPGEO) of the Federal University of Pernambuco (UFPE). The research is scientifically affiliated with the Intertropical Landscape Dynamics Research Laboratory (INTERTRÓPICOS) and the Geography and Conservation in Tropical Landscapes Research Group (PAISAGEO).',
      'affil.capes': 'The research is supported by the Coordination for the Improvement of Higher Education Personnel (CAPES).',
      'affil.site': 'Website',
      'affil.page': 'Page',
      'affil.social': 'Social media',
      'logo.ufpe': 'Logo of the Federal University of Pernambuco',
      'logo.capes': 'Logo of the Coordination for the Improvement of Higher Education Personnel (CAPES)',
      'logo.ppgeo': 'Logo of the Graduate Program in Geography (PPGEO) of UFPE',
      'logo.intertropicos': 'Logo of the Intertropical Landscape Dynamics Research Laboratory (INTERTRÓPICOS)',
      'logo.paisageo': 'Logo of the Geography and Conservation in Tropical Landscapes Research Group (PAISAGEO)',
      'cite.title': 'How to cite',
      'cite.intro': 'To cite Nomos as software, use the reference below.',
      'cite.label': 'Citation format',
      'cite.chicago': 'Chicago (author-date)',
      'cite.copy': 'Copy reference',
      'cite.copied': 'Reference copied',
      'cite.copyFailed': 'Could not copy',
      'cite.note': 'References are generated automatically. Check the guidelines of the journal or institution.',
      'cite.noteGeneric': 'This reference cites Nomos without a version and uses the DOI for all versions, which always points to the latest one. To cite a specific version, use its DOI on the <a href="{url}" target="_blank" rel="noopener noreferrer">Zenodo record<span class="visually-hidden"> (opens in a new tab)</span></a>.',
      'cite.noteVersion': 'This reference cites version <span data-cite-version></span> of Nomos and uses the DOI of that version. To cite the software in general, without a version, use the DOI for all versions: <a href="{url}" target="_blank" rel="noopener noreferrer">{doi}<span class="visually-hidden"> (opens in a new tab)</span></a>.',
      'code.title': 'Code and license',
      'code.text': 'The Nomos source code is open and distributed under the GNU GPL v3 license.',
      'code.button': 'GitHub repository'
    },
    es: {
      'meta.title': 'Nomos | Aplicación para inventarios ambientales: descarga, autoría y cita',
      'meta.description': 'Nomos es una aplicación móvil para inventarios ambientales, desarrollada en el PPGEO de la UFPE. Descargue el APK para Android, conozca la autoría y la vinculación académica y vea cómo citar el software.',
      'meta.ogTitle': 'Nomos | Aplicación para inventarios ambientales',
      'meta.ogDescription': 'Descargue la aplicación Nomos para Android, conozca la autoría y la vinculación académica y vea cómo citar el software en ABNT, APA, Vancouver, IEEE, MLA, Chicago, BibTeX y RIS.',
      'logo.alt': 'Logotipo de Nomos',
      'lang.label': 'Idioma',
      'skip.link': 'Ir al contenido',
      'a11y.newTab': ' (se abre en una pestaña nueva)',
      'hero.lead': 'Aplicación móvil para inventarios ambientales',
      'download.title': 'Descargar Nomos',
      'download.button': 'Descargar para Android',
      'download.allVersions': 'Ver todas las versiones',
      'version.line': 'Versión {version} · publicada el {date}',
      'version.lineNoDate': 'Versión {version}',
      'version.fallback': 'Última versión publicada',
      'install.summary': 'Cómo instalar',
      'install.step1': 'Toque <strong>Descargar para Android</strong> y espere a que termine la descarga del archivo.',
      'install.step2': 'El navegador puede advertir que el archivo podría ser dañino. Esto es habitual en aplicaciones instaladas fuera de la tienda. Elija conservar la descarga.',
      'install.step3': 'Abra el archivo descargado.',
      'install.step4': 'Android puede solicitar permiso para que el navegador instale aplicaciones de fuentes desconocidas. Autorícelo solo para esta instalación.',
      'install.step5': 'Complete la instalación.',
      'about.title': 'Qué es Nomos',
      'about.text': 'Nomos apoya los inventarios ambientales. En su versión inicial, implementa un protocolo de cartografía del paisaje desarrollado en el PPGEO de la UFPE, y actúa como intermediario <span class="nowrap">técnico-metodológico</span> para sustituir los registros analógicos por un flujo digital estructurado, estandarizado y reproducible. La aplicación también permite usar protocolos más sencillos, creados por el propio usuario.',
      'about.f1': '<strong>Recolección sin conexión.</strong> Los registros se guardan en el propio dispositivo, sin necesidad de conexión en campo.',
      'about.f2': '<strong>Clasificación fisonómica automatizada.</strong> Genera la fórmula de vegetación según el sistema de Küchler.',
      'about.f3': '<strong>Nomenclatura estandarizada del paisaje.</strong> Compone el nombre de la unidad a partir de los atributos observados en campo.',
      'about.f4': '<strong>Arquitectura modular de protocolos.</strong> El protocolo de referencia es un módulo entre otros, y es posible crear protocolos personalizados.',
      'about.f5': '<strong>Exportación estructurada.</strong> Genera datos en GeoJSON y CSV, con los medios de campo en un archivo comprimido.',
      'about.f6': '<strong>Copia de seguridad y colaboración con Google Drive.</strong> Mantenga copias de seguridad de sus registros y comparta el trabajo con su equipo.',
      'guide.title': 'Guías y tutoriales',
      'guide.itemTitle': 'Guía práctica de uso',
      'guide.meta': 'Versión 1.0 · agosto de 2026',
      'guide.text': 'Orientaciones prácticas para usar la aplicación en los inventarios ambientales de campo.',
      'guide.open': 'Abrir guía',
      'guide.onlyPt': 'La guía está disponible por ahora solo en portugués.',
      'authors.title': 'Autoría',
      'authors.author': 'Autor',
      'authors.advisor': 'Director de tesis',
      'affil.title': 'Vinculación y apoyo institucional',
      'affil.text': 'Nomos es un producto tecnológico desarrollado en una investigación de maestría vinculada al Programa de Posgrado en Geografía (PPGEO) de la Universidad Federal de Pernambuco (UFPE). La investigación tiene afiliación científica al Laboratorio de Investigación en Dinámicas de Paisajes Intertropicales (INTERTRÓPICOS) y al Grupo de Investigación en Geografía y Conservación en Paisajes Tropicales (PAISAGEO).',
      'affil.capes': 'La investigación cuenta con el apoyo de la Coordinación de Perfeccionamiento del Personal de Nivel Superior (CAPES).',
      'affil.site': 'Sitio web',
      'affil.page': 'Página',
      'affil.social': 'Red social',
      'logo.ufpe': 'Logotipo de la Universidad Federal de Pernambuco',
      'logo.capes': 'Logotipo de la Coordinación de Perfeccionamiento del Personal de Nivel Superior (CAPES)',
      'logo.ppgeo': 'Logotipo del Programa de Posgrado en Geografía (PPGEO) de la UFPE',
      'logo.intertropicos': 'Logotipo del Laboratorio de Investigación en Dinámicas de Paisajes Intertropicales (INTERTRÓPICOS)',
      'logo.paisageo': 'Logotipo del Grupo de Investigación en Geografía y Conservación en Paisajes Tropicales (PAISAGEO)',
      'cite.title': 'Cómo citar',
      'cite.intro': 'Para citar Nomos como software, utilice la siguiente referencia.',
      'cite.label': 'Formato de cita',
      'cite.chicago': 'Chicago (autor-fecha)',
      'cite.copy': 'Copiar referencia',
      'cite.copied': 'Referencia copiada',
      'cite.copyFailed': 'No se pudo copiar',
      'cite.note': 'Las referencias se generan automáticamente. Consulte las normas de la revista o de la institución.',
      'cite.noteGeneric': 'Esta referencia cita Nomos sin indicar versión y usa el DOI de todas las versiones, que apunta siempre a la más reciente. Para citar una versión específica, utilice su DOI en el <a href="{url}" target="_blank" rel="noopener noreferrer">registro de Zenodo<span class="visually-hidden"> (se abre en una pestaña nueva)</span></a>.',
      'cite.noteVersion': 'Esta referencia cita la versión <span data-cite-version></span> de Nomos y usa el DOI de esa versión. Para citar el software en general, sin indicar versión, utilice el DOI de todas las versiones: <a href="{url}" target="_blank" rel="noopener noreferrer">{doi}<span class="visually-hidden"> (se abre en una pestaña nueva)</span></a>.',
      'code.title': 'Código y licencia',
      'code.text': 'El código de Nomos es abierto y se distribuye bajo la licencia GNU GPL v3.',
      'code.button': 'Repositorio en GitHub'
    },
    fr: {
      'meta.title': 'Nomos | Application pour inventaires environnementaux : téléchargement, auteurs et citation',
      'meta.description': 'Nomos est une application mobile pour les inventaires environnementaux, développée au PPGEO de l\'UFPE. Téléchargez l\'APK pour Android, découvrez les auteurs et le rattachement académique, et voyez comment citer le logiciel.',
      'meta.ogTitle': 'Nomos | Application pour inventaires environnementaux',
      'meta.ogDescription': 'Téléchargez l\'application Nomos pour Android, découvrez les auteurs et le rattachement académique, et voyez comment citer le logiciel en ABNT, APA, Vancouver, IEEE, MLA, Chicago, BibTeX et RIS.',
      'logo.alt': 'Logo de Nomos',
      'lang.label': 'Langue',
      'skip.link': 'Aller au contenu',
      'a11y.newTab': ' (s\'ouvre dans un nouvel onglet)',
      'hero.lead': 'Application mobile pour inventaires environnementaux',
      'download.title': 'Télécharger Nomos',
      'download.button': 'Télécharger pour Android',
      'download.allVersions': 'Voir toutes les versions',
      'version.line': 'Version {version} · publiée le {date}',
      'version.lineNoDate': 'Version {version}',
      'version.fallback': 'Dernière version publiée',
      'install.summary': 'Comment installer',
      'install.step1': 'Touchez <strong>Télécharger pour Android</strong> et attendez la fin du téléchargement du fichier.',
      'install.step2': 'Le navigateur peut signaler que le fichier pourrait être dangereux. C\'est courant pour les applications installées hors du magasin. Choisissez de conserver le téléchargement.',
      'install.step3': 'Ouvrez le fichier téléchargé.',
      'install.step4': 'Android peut demander l\'autorisation pour que le navigateur installe des applications provenant de sources inconnues. Autorisez uniquement pour cette installation.',
      'install.step5': 'Terminez l\'installation.',
      'about.title': 'Qu\'est-ce que Nomos',
      'about.text': 'Nomos soutient les inventaires environnementaux. Dans sa version initiale, il met en œuvre un protocole de cartographie du paysage développé au PPGEO de l\'UFPE, et sert d\'intermédiaire <span class="nowrap">technique et méthodologique</span> pour remplacer les relevés analogiques par un flux numérique structuré, standardisé et reproductible. L\'application permet aussi d\'utiliser des protocoles plus simples, créés par l\'utilisateur lui-même.',
      'about.f1': '<strong>Collecte hors ligne.</strong> Les données sont enregistrées sur l\'appareil lui-même, sans connexion requise sur le terrain.',
      'about.f2': '<strong>Classification physionomique automatisée.</strong> Génère la formule de végétation selon le système de Küchler.',
      'about.f3': '<strong>Nomenclature normalisée du paysage.</strong> Compose le nom de l\'unité à partir des attributs observés sur le terrain.',
      'about.f4': '<strong>Architecture modulaire des protocoles.</strong> Le protocole de référence est un module parmi d\'autres, et il est possible de créer des protocoles personnalisés.',
      'about.f5': '<strong>Exportation structurée.</strong> Génère des données en GeoJSON et CSV, avec les médias de terrain dans une archive compressée.',
      'about.f6': '<strong>Sauvegarde et collaboration avec Google Drive.</strong> Conservez des copies de sauvegarde de vos enregistrements et partagez le travail avec votre équipe.',
      'guide.title': 'Guides et tutoriels',
      'guide.itemTitle': 'Guide pratique d\'utilisation',
      'guide.meta': 'Version 1.0 · août 2026',
      'guide.text': 'Conseils pratiques pour utiliser l\'application dans les inventaires environnementaux de terrain.',
      'guide.open': 'Ouvrir le guide',
      'guide.onlyPt': 'Le guide n\'est disponible pour l\'instant qu\'en portugais.',
      'authors.title': 'Auteurs',
      'authors.author': 'Auteur',
      'authors.advisor': 'Directeur de mémoire',
      'affil.title': 'Rattachement et soutien institutionnel',
      'affil.text': 'Nomos est un produit technologique développé dans le cadre d\'une recherche de master rattachée au Programme d\'études supérieures en géographie (PPGEO) de l\'Université fédérale de Pernambuco (UFPE). La recherche est scientifiquement affiliée au Laboratoire de recherche sur les dynamiques des paysages intertropicaux (INTERTRÓPICOS) et au Groupe de recherche en géographie et conservation des paysages tropicaux (PAISAGEO).',
      'affil.capes': 'La recherche bénéficie du soutien de la Coordination de perfectionnement du personnel de l\'enseignement supérieur (CAPES).',
      'affil.site': 'Site web',
      'affil.page': 'Page',
      'affil.social': 'Réseau social',
      'logo.ufpe': 'Logo de l\'Université fédérale de Pernambuco',
      'logo.capes': 'Logo de la Coordination de perfectionnement du personnel de l\'enseignement supérieur (CAPES)',
      'logo.ppgeo': 'Logo du Programme d\'études supérieures en géographie (PPGEO) de l\'UFPE',
      'logo.intertropicos': 'Logo du Laboratoire de recherche sur les dynamiques des paysages intertropicaux (INTERTRÓPICOS)',
      'logo.paisageo': 'Logo du Groupe de recherche en géographie et conservation des paysages tropicaux (PAISAGEO)',
      'cite.title': 'Comment citer',
      'cite.intro': 'Pour citer Nomos en tant que logiciel, utilisez la référence ci-dessous.',
      'cite.label': 'Format de citation',
      'cite.chicago': 'Chicago (auteur-date)',
      'cite.copy': 'Copier la référence',
      'cite.copied': 'Référence copiée',
      'cite.copyFailed': 'Impossible de copier',
      'cite.note': 'Les références sont générées automatiquement. Vérifiez les normes de la revue ou de l\'institution.',
      'cite.noteGeneric': 'Cette référence cite Nomos sans indiquer de version et utilise le DOI de toutes les versions, qui pointe toujours vers la plus récente. Pour citer une version précise, utilisez son DOI sur la <a href="{url}" target="_blank" rel="noopener noreferrer">notice Zenodo<span class="visually-hidden"> (s\'ouvre dans un nouvel onglet)</span></a>.',
      'cite.noteVersion': 'Cette référence cite la version <span data-cite-version></span> de Nomos et utilise le DOI de cette version. Pour citer le logiciel de façon générale, sans indiquer de version, utilisez le DOI de toutes les versions : <a href="{url}" target="_blank" rel="noopener noreferrer">{doi}<span class="visually-hidden"> (s\'ouvre dans un nouvel onglet)</span></a>.',
      'code.title': 'Code et licence',
      'code.text': 'Le code de Nomos est ouvert et distribué sous la licence GNU GPL v3.',
      'code.button': 'Dépôt GitHub'
    }
  };

  var current = DEFAULT_LOCALE;

  function match(value) {
    if (typeof value !== 'string') return null;
    var lower = value.toLowerCase();
    return LOCALES.filter(function (locale) { return locale.toLowerCase() === lower; })[0] || null;
  }

  function t(key, locale, vars) {
    var table = DICT[locale] || DICT[DEFAULT_LOCALE];
    var text = key in table ? table[key] : (key in DICT[DEFAULT_LOCALE] ? DICT[DEFAULT_LOCALE][key] : key);
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, function (placeholder, name) {
      return name in vars ? String(vars[name]) : placeholder;
    });
  }

  function readUrlLocale() {
    try {
      return match(new URLSearchParams(root.location.search).get('lang'));
    } catch (e) {
      return null;
    }
  }

  function readStoredLocale() {
    try {
      return match(root.localStorage.getItem(STORAGE_KEY));
    } catch (e) {
      return null;
    }
  }

  function persist(locale) {
    try {
      root.localStorage.setItem(STORAGE_KEY, locale);
    } catch (e) {}
    try {
      var url = new URL(root.location.href);
      if (locale === DEFAULT_LOCALE) url.searchParams.delete('lang');
      else url.searchParams.set('lang', locale);
      root.history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch (e) {}
  }

  function resolve() {
    return readUrlLocale() || readStoredLocale() || DEFAULT_LOCALE;
  }

  function templateVars() {
    var lib = root.NomosCitation;
    return lib ? { url: lib.CONCEPT_DOI_URL, doi: lib.CONCEPT_DOI } : {};
  }

  function applyGuide(locale) {
    var link = document.getElementById('guide-link');
    var note = document.querySelector('.resource-note');
    var own = GUIDE_URLS[locale];
    if (link) {
      link.setAttribute('href', own || GUIDE_URLS[DEFAULT_LOCALE]);
      if (own) link.removeAttribute('hreflang');
      else link.setAttribute('hreflang', DEFAULT_LOCALE);
    }
    if (note) note.hidden = !!own;
  }

  function apply(locale) {
    var loc = match(locale) || DEFAULT_LOCALE;
    current = loc;
    if (typeof document === 'undefined') return;

    document.documentElement.setAttribute('lang', loc);
    var ogLocale = document.querySelector('meta[property="og:locale"]');
    if (ogLocale) ogLocale.setAttribute('content', OG_LOCALES[loc]);

    Array.prototype.forEach.call(
      document.querySelectorAll('[data-i18n], [data-i18n-html], [data-i18n-attr]'),
      function (el) {
        var key = el.getAttribute('data-i18n');
        var htmlKey = el.getAttribute('data-i18n-html');
        var attrs = el.getAttribute('data-i18n-attr');
        if (key) el.textContent = t(key, loc);
        if (htmlKey) {
          var html = t(htmlKey, loc, templateVars());
          if (!/\{\w+\}/.test(html)) el.innerHTML = html;
        }
        if (attrs) {
          attrs.split(';').forEach(function (pair) {
            var at = pair.indexOf(':');
            if (at > 0) el.setAttribute(pair.slice(0, at).trim(), t(pair.slice(at + 1).trim(), loc));
          });
        }
      }
    );

    applyGuide(loc);
    document.dispatchEvent(new CustomEvent('nomos:localechange', { detail: { locale: loc } }));
  }

  function set(locale) {
    var loc = match(locale) || DEFAULT_LOCALE;
    persist(loc);
    apply(loc);
  }

  function get() {
    return current;
  }

  function init() {
    apply(resolve());
  }

  var api = {
    DEFAULT_LOCALE: DEFAULT_LOCALE,
    LOCALES: LOCALES,
    INTL_LOCALES: INTL_LOCALES,
    DICT: DICT,
    GUIDE_URLS: GUIDE_URLS,
    t: t,
    get: get,
    set: set,
    apply: apply,
    init: init
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  return api;
});
