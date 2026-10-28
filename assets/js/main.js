// Progressive enhancement for the landing page: nomos-version.json is fetched once per
// page load and shared by the download note and the citation. Without JavaScript (or on
// any failure) the static text in index.html is left untouched.
(function () {
  'use strict';

  var SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
  var ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

  document.documentElement.classList.add('js');

  var i18n = window.NomosI18n;
  if (!i18n) return;

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

  // Release date in the medium style of the given Intl locale, or null if it cannot be formatted.
  function formatDate(timestamp, intlLocale) {
    if (timestamp === null || !window.Intl || !Intl.DateTimeFormat) return null;
    try {
      return new Intl.DateTimeFormat(intlLocale, { dateStyle: 'medium', timeZone: 'UTC' }).format(timestamp);
    } catch (e) {
      return null;
    }
  }

  // Download: the version line is rebuilt from the stored JSON on every language change.
  // On failure the translated fallback applied by NomosI18n stays in place.
  function initDownload() {
    var el = document.getElementById('app-version');
    if (!el) return;
    var published = null;

    function render() {
      if (!published) return;
      var locale = i18n.get();
      var date = formatDate(published.released, i18n.INTL_LOCALES[locale]);
      el.textContent = date
        ? i18n.t('version.line', locale, { version: published.version, date: date })
        : i18n.t('version.lineNoDate', locale, { version: published.version });
    }

    document.addEventListener('nomos:localechange', render);
    whenVersion(function (info) {
      published = info;
      render();
    });
  }

  // Citation: format selector, live reference and clipboard copy.
  function initCitation() {
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
    var statusKey = '';
    var statusTimer = null;

    function render() {
      var chosen = lib.FORMATS.filter(function (f) { return f.id === select.value; })[0] || lib.FORMATS[0];
      current = chosen.format(data);
      output.textContent = current;
      output.classList.toggle('reference--code', chosen.code);
      statusKey = '';
      showStatus();
    }

    function showStatus() {
      if (status) status.textContent = statusKey ? i18n.t(statusKey, i18n.get()) : '';
    }

    function setStatus(key) {
      if (!status) return;
      statusKey = key;
      showStatus();
      clearTimeout(statusTimer);
      statusTimer = setTimeout(function () { statusKey = ''; showStatus(); }, 3000);
    }

    select.addEventListener('change', render);
    document.addEventListener('nomos:localechange', showStatus);

    if (copyButton && navigator.clipboard && navigator.clipboard.writeText) {
      copyButton.hidden = false;
      copyButton.addEventListener('click', function () {
        navigator.clipboard.writeText(current).then(
          function () { setStatus('cite.copied'); },
          function () { setStatus('cite.copyFailed'); }
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

  // Language selector: hidden until this script runs, so without JavaScript nothing shows.
  function initLanguage() {
    var nav = document.getElementById('lang-nav');
    if (!nav) return;
    var buttons = Array.prototype.slice.call(nav.querySelectorAll('button'));

    function sync() {
      var locale = i18n.get();
      buttons.forEach(function (button) {
        if (button.getAttribute('lang') === locale) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
      });
    }

    buttons.forEach(function (button) {
      button.addEventListener('click', function () { i18n.set(button.getAttribute('lang')); });
    });
    document.addEventListener('nomos:localechange', sync);
    nav.hidden = false;
    sync();
  }

  initLanguage();
  initDownload();
  initCitation();
})();
