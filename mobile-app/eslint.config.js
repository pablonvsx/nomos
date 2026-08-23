// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

// Second barrier for the layer rules enforced by
// protocol-kernel/__tests__/layer-rules.test.ts (the two are meant to be
// kept in sync by hand - see docs/arquitetura-nomos/13_DIAGNOSTICO_CAMADAS.md
// for the full rule table and rationale). Uses @typescript-eslint's variant
// of no-restricted-imports (already a transitive dep via eslint-config-expo,
// no new package added) because it can allow `import type` while still
// blocking value imports of the same path - plain no-restricted-imports
// cannot make that distinction.
const DOC_REF = 'ver docs/arquitetura-nomos/13_DIAGNOSTICO_CAMADAS.md';

function layerRule(patterns) {
  return { '@typescript-eslint/no-restricted-imports': ['error', { patterns }] };
}

const layerBoundaries = [
  {
    files: ['core/**/*.ts', 'core/**/*.tsx'],
    ignores: ['core/**/__tests__/**'],
    rules: layerRule([
      {
        group: ['@/protocol-kernel/*'],
        message: `core/ só importa protocol-kernel/ via "import type" (${DOC_REF}).`,
        allowTypeImports: true,
      },
    ]),
  },
  {
    files: ['protocol-kernel/**/*.ts', 'protocol-kernel/**/*.tsx'],
    ignores: ['protocol-kernel/**/__tests__/**'],
    rules: layerRule([
      {
        group: ['@/core/*'],
        message: `protocol-kernel/ não importa de core/, em nenhuma forma (${DOC_REF}).`,
      },
      {
        group: ['@/modules/*'],
        message: `protocol-kernel/ não importa de modules/ (${DOC_REF}).`,
      },
      {
        group: ['@/app/*'],
        message: `protocol-kernel/ não importa de app/ (${DOC_REF}).`,
      },
    ]),
  },
  {
    files: ['modules/generic/**/*.ts', 'modules/generic/**/*.tsx'],
    ignores: ['modules/generic/**/__tests__/**'],
    rules: layerRule([
      {
        group: ['@/modules/paisageo/*', '@/modules/custom/*'],
        message: `modules/generic/ não tem identidade de protocolo, não importa modules/<protocolo>/ (${DOC_REF}).`,
      },
      {
        group: ['@/protocol-kernel/*'],
        message: `modules/generic/ só importa protocol-kernel/ via "import type" (${DOC_REF}).`,
        allowTypeImports: true,
      },
    ]),
  },
  {
    files: ['db/**/*.ts', 'db/**/*.tsx'],
    ignores: ['db/**/__tests__/**'],
    rules: layerRule([
      {
        group: ['@/modules/*'],
        message: `db/ não importa de modules/ (${DOC_REF}).`,
      },
      {
        group: ['@/protocol-kernel/*'],
        message: `db/ só importa protocol-kernel/ via "import type" (${DOC_REF}).`,
        allowTypeImports: true,
      },
    ]),
  },
  {
    files: ['components/**/*.ts', 'components/**/*.tsx'],
    ignores: ['components/**/__tests__/**'],
    rules: layerRule([
      {
        group: ['@/modules/*'],
        message: `components/ é agnóstico de protocolo, não importa modules/ (${DOC_REF}).`,
      },
      {
        group: ['@/protocol-kernel/*'],
        message: `components/ não importa protocol-kernel/ (${DOC_REF}).`,
      },
    ]),
  },
  {
    files: ['modules/paisageo/**/*.ts', 'modules/paisageo/**/*.tsx'],
    ignores: ['modules/paisageo/**/__tests__/**'],
    rules: layerRule([
      {
        group: ['@/modules/custom/*'],
        message: `protocolos não se importam entre si diretamente - use modules/registry.ts (${DOC_REF}).`,
      },
    ]),
  },
  {
    files: ['modules/custom/**/*.ts', 'modules/custom/**/*.tsx'],
    ignores: ['modules/custom/**/__tests__/**'],
    rules: layerRule([
      {
        group: ['@/modules/paisageo/*'],
        message: `protocolos não se importam entre si diretamente - use modules/registry.ts (${DOC_REF}).`,
      },
    ]),
  },
];

module.exports = defineConfig([
  expoConfig,
  {
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {},
  },
  ...layerBoundaries,
  {
    ignores: ['dist/*'],
  },
]);
