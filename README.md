<h1 align="center">Nomos</h1>

<div align="justify">
O <strong>Nomos</strong> é um aplicativo móvel concebido para a coleta, validação e organização de dados de campo na Cartografia de Paisagens. Ele atua como uma ferramenta de mediação metodológica, substituindo os registros analógicos tradicionais por um processo de coleta digital estruturado e padronizado. Ao implementar digitalmente o Protocolo Paisageo, fundamentado na Teoria dos Geossistemas, o aplicativo converte a etapa de campo em um ato de processamento integrado, mitigando viéses interpretativos e garantindo a interoperabilidade dos dados primários.
</div>


## Contexto Acadêmico
<div align="justify">
Este projeto integra a pesquisa de mestrado desenvolvida no Programa de Pós-Graduação em Geografia (PPGEO) da Universidade Federal de Pernambuco (UFPE).

* **Autor:** Pablo Guilherme de Melo Neves[.
* **Orientador:** Prof. Dr. Lucas Costa de Souza Cavalcanti.
* **Grupo de Pesquisa:** PAISAGEO - Geografia de Paisagens Tropicais.
</div>


## Significado do Nome
<div align="justify">
O nome "Nomos" deriva do verbo grego <em>nemein</em>, cujo campo semântico original, de natureza territorial e distributiva, referia-se ao ato de distribuir parcelas e ordenar o território, precedendo seu significado contemporâneo normativo de "lei". A escolha reflete a função epistemológica da ferramenta: assim como <em>nomos</em> nomeava a ordenação inicial do espaço, o aplicativo estrutura a observação do pesquisador em campo, convertendo percepções empíricas em variáveis padronizadas e comparáveis, assumindo o registro sistemático como um ato fundamental de ordenação espacial.
</div>


## Funcionalidades Principais
<div align="justify">
<ul>
  <li><strong>Implementação do Protocolo Paisageo:</strong> Formulário de campo estruturado com componentes abióticos, bióticos e antrópicos, assegurando a integridade taxonômica do levantamento geossistêmico.</li>
  <li><strong>Classificação Fisionômica (Matriz de Küchler):</strong> Interface interativa que codifica a estrutura da vegetação com base em formas de vida, altura e cobertura foliar por estrato.</li>
  <li><strong>Automação Analítica:</strong> Algoritmos locais que processam os dados inseridos in situ para classificar automaticamente o grupo vegetacional e compor uma síntese nomenclatural padronizada para a unidade de paisagem.</li>
  <li><strong>Paradigma Offline-First:</strong> Operação totalmente independente de rede móvel, com dados persistidos em banco de dados relacional embarcado, garantindo o funcionamento em ambientes naturais remotos.</li>
  <li><strong>Localização e Rota (Mapa Integrado):</strong> Ferramenta cartográfica voltada exclusivamente para ajudar o pesquisador a se localizar em campo dentro da sua área de estudo e em sua rota de coleta, sem funções supérfluas de delimitação no mapa interativo.</li>
  <li><strong>Exportação Interoperável:</strong> Geração simultânea de feições georreferenciadas (GeoJSON), tabelas de atributos achatadas prontas para análise estatística (CSV) e banco de imagens estruturado (ZIP), suprimindo a necessidade de transcrição pós-campo[.</li>
</ul>
</div>


## Tecnologias Utilizadas
<div align="justify">
<ul>
  <li><strong>React Native & Expo:</strong> Framework base para o desenvolvimento multiplataforma.</li>
  <li><strong>TypeScript:</strong> Linguagem adotada para assegurar a consistência e a tipagem estrita do modelo de dados.</li>
  <li><strong>SQLite (Modo WAL):</strong> Motor de banco de dados adotado para alta concorrência de leitura/escrita em operações offline.</li>
  <li><strong>React Native Paper:</strong> Componentização de interface balizada pelas diretrizes do Material Design 3.</li>
</ul>
</div>
