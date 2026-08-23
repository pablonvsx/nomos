/** @type {import('ts-jest').JestConfigWithTsJest} */
// Testes de lógica pura (*.test.ts) rodam aqui com ts-jest + node.
// Testes de componente React Native (*.test.tsx) precisarão de um projeto
// separado com preset "jest-expo" e React Native Testing Library — adicionar
// em `projects: []` quando essa necessidade surgir (Fase 8+).
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          strict: true,
          esModuleInterop: true,
        },
      },
    ],
  },
};
