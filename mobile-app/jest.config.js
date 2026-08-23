/** @type {import('ts-jest').JestConfigWithTsJest} */
// Logic tests (*.test.ts) run here with ts-jest + node.
// React Native component tests (*.test.tsx) will require a separate project
// with preset "jest-expo" and React Native Testing Library — add to `projects: []`
// when that need arises (Phase 8+).
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
