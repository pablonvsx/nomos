// Citation formats for the Nomos software. Every formatter is a pure function:
// data in, text out. Loaded in the browser (window.NomosCitation) and in Node (module.exports).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NomosCitation = factory();
})(this, function () {
  'use strict';

  // Concept DOI of Nomos on Zenodo (all versions), without the resolver prefix.
  var NOMOS_DOI = '10.5281/zenodo.22069700';
  var DOI_URL = 'https://doi.org/' + NOMOS_DOI;

  // Single place with the citation data. `version`, `year` and `access` are
  // filled in at runtime (nomos-version.json and the visitor's current day).
  var CONFIG = {
    author: { family: 'Neves', given: 'Pablo Guilherme de Melo' },
    title: 'Nomos: aplicativo móvel para inventários ambientais',
    version: '',
    year: 2026,
    place: 'Recife',
    country: 'Brazil',
    institution: 'Universidade Federal de Pernambuco',
    url: 'https://pablonvsx.github.io/nomos/',
    doi: NOMOS_DOI,
    doiUrl: DOI_URL,
    access: null // { year, month (1-12), day }
  };

  // Fixed tables: no toLocaleDateString, so the output never depends on the browser locale.
  var MONTHS_PT_ABNT = ['jan.', 'fev.', 'mar.', 'abr.', 'maio', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
  var MONTHS_EN_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTHS_EN_MLA = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];

  // Name particles dropped from initials ("Pablo Guilherme de Melo" -> P. G. M.).
  var PARTICLES = /^(de|da|do|das|dos|e)$/i;

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function initials(given) {
    return given
      .split(/\s+/)
      .filter(function (name) { return name && !PARTICLES.test(name); })
      .map(function (name) { return name.charAt(0).toUpperCase(); });
  }

  function dotted(given) {
    return initials(given).join('. ') + '.';
  }

  function versionPart(data, prefix, suffix) {
    return data.version ? prefix + data.version + suffix : '';
  }

  function abnt(d) {
    var a = d.author;
    var out = a.family.toUpperCase() + ', ' + a.given + '. ' + d.title + '. ' +
      versionPart(d, 'Versão ', '. ') +
      d.place + ': ' + d.institution + ', ' + d.year + '. Software. ' +
      'DOI: ' + d.doi + '. ' +
      'Disponível em: ' + d.url + '.';
    if (d.access) {
      out += ' Acesso em: ' + d.access.day + ' ' + MONTHS_PT_ABNT[d.access.month - 1] + ' ' + d.access.year + '.';
    }
    return out;
  }

  function apa7(d) {
    return d.author.family + ', ' + dotted(d.author.given) + ' (' + d.year + '). ' + d.title +
      versionPart(d, ' (Version ', ')') + ' [Computer software]. ' +
      d.institution + '. ' + d.doiUrl;
  }

  function vancouver(d) {
    var out = d.author.family + ' ' + initials(d.author.given).join('') + '. ' + d.title + ' [software]. ' +
      versionPart(d, 'Version ', '. ') +
      d.place + ': ' + d.institution + '; ' + d.year;
    if (d.access) {
      out += ' [cited ' + d.access.year + ' ' + MONTHS_EN_SHORT[d.access.month - 1] + ' ' + pad2(d.access.day) + ']';
    }
    return out + '. Available from: ' + d.url + ' doi:' + d.doi;
  }

  function ieee(d) {
    return dotted(d.author.given) + ' ' + d.author.family + ', "' + d.title + ',"' +
      versionPart(d, ' version ', ',') + ' software, ' +
      d.institution + ', ' + d.place + ', ' + d.country + ', ' + d.year + '. [Online]. Available: ' + d.url + ', doi: ' + d.doi + '.';
  }

  function mla9(d) {
    var out = d.author.family + ', ' + d.author.given + '. ' + d.title + '. ' +
      versionPart(d, 'Version ', ', ') +
      d.institution + ', ' + d.year + ', ' + d.doiUrl + '.';
    if (d.access) {
      out += ' Accessed ' + d.access.day + ' ' + MONTHS_EN_MLA[d.access.month - 1] + ' ' + d.access.year + '.';
    }
    return out;
  }

  function chicago(d) {
    return d.author.family + ', ' + d.author.given + '. ' + d.year + '. ' + d.title + '. ' +
      versionPart(d, 'Version ', '. ') +
      d.place + ': ' + d.institution + '. ' + d.doiUrl + '.';
  }

  function bibtex(d) {
    var key = d.author.family.toLowerCase() + d.year + 'nomos';
    var lines = [
      '@misc{' + key + ',',
      '  author       = {' + d.author.family + ', ' + d.author.given + '},',
      '  title        = {' + d.title.replace(/^Nomos/, '{Nomos}') + '},',
      '  year         = {' + d.year + '},'
    ];
    if (d.version) lines.push('  version      = {' + d.version + '},');
    lines.push(
      '  note         = {Software},',
      '  organization = {' + d.institution + '},',
      '  address      = {' + d.place + '},',
      '  doi          = {' + d.doi + '},',
      '  howpublished = {\\url{' + d.url + '}}' + (d.access ? ',' : '')
    );
    if (d.access) lines.push('  urldate      = {' + d.access.year + '-' + pad2(d.access.month) + '-' + pad2(d.access.day) + '}');
    lines.push('}');
    return lines.join('\n');
  }

  function ris(d) {
    var lines = [
      'TY  - COMP',
      'AU  - ' + d.author.family + ', ' + d.author.given,
      'TI  - ' + d.title,
      'PY  - ' + d.year
    ];
    if (d.version) lines.push('ET  - ' + d.version);
    lines.push(
      'PB  - ' + d.institution,
      'CY  - ' + d.place,
      'UR  - ' + d.url
    );
    if (d.access) lines.push('Y2  - ' + d.access.year + '/' + pad2(d.access.month) + '/' + pad2(d.access.day));
    lines.push('DO  - ' + d.doi, 'ER  -');
    return lines.join('\n');
  }

  // Order here is the order of the <select> options; `code` formats render in monospace.
  var FORMATS = [
    { id: 'abnt', label: 'ABNT', format: abnt, code: false },
    { id: 'apa7', label: 'APA 7', format: apa7, code: false },
    { id: 'vancouver', label: 'Vancouver', format: vancouver, code: false },
    { id: 'ieee', label: 'IEEE', format: ieee, code: false },
    { id: 'mla9', label: 'MLA 9', format: mla9, code: false },
    { id: 'chicago', label: 'Chicago (autor-data)', format: chicago, code: false },
    { id: 'bibtex', label: 'BibTeX', format: bibtex, code: true },
    { id: 'ris', label: 'RIS', format: ris, code: true }
  ];

  return { CONFIG: CONFIG, FORMATS: FORMATS, DOI: NOMOS_DOI, DOI_URL: DOI_URL };
});
