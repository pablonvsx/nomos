// Progressive enhancement for the landing page: nomos-version.json is fetched once per
// page load and shared by the download note and the citation. Without JavaScript (or on
// any failure) the static text in index.html is left untouched.
(function () {
  'use strict';

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
        return {
          version: version,
          year: date ? Number(date[1]) : null,
          date: date ? date[3] + '/' + date[2] + '/' + date[1] : null
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

  // Download: "Versão X · publicada em DD/MM/AAAA · arquivo .apk"
  function initDownload() {
    var el = document.getElementById('app-version');
    if (!el) return;
    whenVersion(function (info) {
      if (!info) return;
      var parts = ['Versão ' + info.version];
      if (info.date) parts.push('publicada em ' + info.date);
      parts.push('arquivo .apk');
      el.textContent = parts.join(' · ');
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
          function () { setStatus('Referência copiada'); },
          function () { setStatus('Não foi possível copiar'); }
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

  initDownload();
  initCitation();
})();
