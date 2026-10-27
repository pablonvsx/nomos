# Nomos: site publicado

Esta branch (`gh-pages`) é o site do Nomos, servido pelo GitHub Pages em https://pablonvsx.github.io/nomos/. É HTML, CSS e JS puros, sem build.

Para atualizar a versão publicada, edite `nomos-version.json` (na raiz) e faça o commit. O aplicativo e a página leem esse arquivo:

- `latest_version`: versão mais recente (semver, ex.: `1.0.0`);
- `min_supported_version`: versão mínima suportada;
- `released_at`: data da versão (`AAAA-MM-DD`).
