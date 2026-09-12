/** @type {import('@jest/types').Config.InitialOptions} */
// Two projects: logic tests (*.test.ts) run with ts-jest + node, exactly as
// before. Component tests (*.test.tsx) run with jest-expo + React Native
// Testing Library, added in Phase C (COLLAB_MODEL_V2_REFERENCE.md section 10
// work) to actually render app/(projects)/project-collaboration/[id].tsx and
// project-approvals/[id].tsx instead of only testing extracted logic.
module.exports = {
  projects: [
    {
      displayName: "logic",
      preset: "ts-jest",
      testEnvironment: "node",
      testMatch: ["<rootDir>/**/__tests__/**/*.test.ts"],
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
    },
    {
      displayName: "components",
      preset: "jest-expo",
      testMatch: ["<rootDir>/**/__tests__/**/*.test.tsx"],
      moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/$1",
      },
    },
  ],
};
