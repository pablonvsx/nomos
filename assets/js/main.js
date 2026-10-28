// Progressive enhancement for the landing page: nomos-version.json is fetched once per
// page load and shared by the download note and the citation. Without JavaScript (or on
// any failure) the static text in index.html is left untouched.
(function () {
  'use strict';

  // Every user-facing string created here lives in STRINGS; read it through t().
  var DEFAULT_LOCALE = 'pt-BR';
  var STRINGS = {
    'pt-BR': {
      versionLabel: 'Versão',
      publishedOn: 'publicada em',
      fileType: 'arquivo .apk',
      versionSeparator: ' · ',
      versionFallback: 'Última versão publicada',
      citationCopied: 'Referência copiada',
      citationCopyFailed: 'Não foi possível copiar'
    }
  };

  function t(key, locale) {
    var table = STRINGS[locale] || STRINGS[DEFAULT_LOCALE];
    return key in table ? table[key] : STRINGS[DEFAULT_LOCALE][key];
  }

  var SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
  var ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

  document.documentElement.classList.add('js');

  // The only request for nomos-version.json. Resolves to { version, year, date } or null.
  var versionInfo = (function () {
    if (!window.fetch || !window.Promise) return null;
    return fetch('nomos-version.json', { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('bad status');
        return res.json();
      })
      .then(function (data) {
        var version = data && data.latest_version;
        if (typeof version !== 'string' || !SEMVER.test(version)) return null;
        var date = ISO_DATE.exec(data.released_at);
        var released = date ? Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3])) : NaN;
        return {
          version: version,
          year: date ? Number(date[1]) : null,
          released: isNaN(released) ? null : released
        };
      })
      .catch(function () {
        return null;
      });
  })();

  function whenVersion(callback) {
    if (versionInfo) versionInfo.then(callback);
    else callback(null);
  }

  // Release date as numeric day/month/year in the given locale, or null if it cannot be formatted.
  function formatDate(timestamp, locale) {
    if (timestamp === null || !window.Intl || !Intl.DateTimeFormat) return null;
    try {
      return new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC'
      }).format(timestamp);
    } catch (e) {
      return null;
    }
  }

  // Download: "Versão X · publicada em DD/MM/AAAA · arquivo .apk"
  function initDownload(locale) {
    var el = document.getElementById('app-version');
    if (!el) return;
    whenVersion(function (info) {
      if (!info) {
        el.textContent = t('versionFallback', locale);
        return;
      }
      var date = formatDate(info.released, locale);
      var parts = [t('versionLabel', locale) + ' ' + info.version];
      if (date) parts.push(t('publishedOn', locale) + ' ' + date);
      parts.push(t('fileType', locale));
      el.textContent = parts.join(t('versionSeparator', locale));
    });
  }

  // Citation: format selector, live reference and clipboard copy.
  function initCitation(locale) {
    var lib = window.NomosCitation;
    var controls = document.getElementById('cite-controls');
    var select = document.getElementById('cite-format');
    var output = document.getElementById('cite-text');
    var copyButton = document.getElementById('cite-copy');
    var status = document.getElementById('cite-status');
    if (!lib || !controls || !select || !output) return;

    var now = new Date();
    var data = {};
    Object.keys(lib.CONFIG).forEach(function (key) { data[key] = lib.CONFIG[key]; });
    data.access = { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };

    var current = '';
    var statusTimer = null;

    function render() {
      var chosen = lib.FORMATS.filter(function (f) { return f.id === select.value; })[0] || lib.FORMATS[0];
      current = chosen.format(data);
      output.textContent = current;
      output.classList.toggle('reference--code', chosen.code);
      if (status) status.textContent = '';
    }

    function setStatus(text) {
      if (!status) return;
      status.textContent = text;
      clearTimeout(statusTimer);
      statusTimer = setTimeout(function () { status.textContent = ''; }, 3000);
    }

    select.addEventListener('change', render);

    if (copyButton && navigator.clipboard && navigator.clipboard.writeText) {
      copyButton.hidden = false;
      copyButton.addEventListener('click', function () {
        navigator.clipboard.writeText(current).then(
          function () { setStatus(t('citationCopied', locale)); },
          function () { setStatus(t('citationCopyFailed', locale)); }
        );
      });
    }

    controls.hidden = false;
    select.value = lib.FORMATS[0].id; // always ABNT on load, no persisted choice

    // Render right away with the fallback year; refine with the published version when it arrives.
    render();
    whenVersion(function (info) {
      if (!info) return;
      data.version = info.version;
      if (info.year) data.year = info.year;
      render();
    });
  }

  var locale = DEFAULT_LOCALE;
  initDownload(locale);
  initCitation(locale);
})();
