// Fills the "Versão" section from nomos-version.json (same file the app reads).
// On any failure the static fallback text in index.html is left untouched.
(function () {
  var el = document.getElementById('app-version');
  if (!el || !window.fetch) return;

  var SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
  var ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

  fetch('nomos-version.json', { cache: 'no-store' })
    .then(function (res) {
      if (!res.ok) throw new Error('bad status');
      return res.json();
    })
    .then(function (data) {
      var version = data && data.latest_version;
      if (typeof version !== 'string' || !SEMVER.test(version)) return;

      var text = 'Versão publicada: ' + version;
      var date = ISO_DATE.exec(data.released_at);
      if (date) text += ' (' + date[3] + '/' + date[2] + '/' + date[1] + ')';
      el.textContent = text;
    })
    .catch(function () {
      // Keep the neutral fallback text; nothing to report to the visitor.
    });
})();
