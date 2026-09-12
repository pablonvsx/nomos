/** @type {import('@jest/types').Config.InitialOptions} */
// Two projects: logic tests (*.test.ts) run with ts-jest + node, exactly as
// before. Component tests (*.test.tsx) run with jest-expo + React Native
// Testing Library, added in Phase C (COLLAB_MODEL_V2_REFERENCE.md section 10
// work) to actually render app/(projects)/project-collaboration/[id].tsx and
// project-approvals/[id].tsx instead of only testing extracted logic.
const path = require("path");

// jest-expo's own preset setup (node_modules/jest-expo/src/preset/setup.js)
// does a plain `require('expo-modules-core')` - normally hoisted to the
// project's top-level node_modules by npm since most expo-* packages depend
// on it, but in this project's dependency graph only `expo` itself pulls it
// in, so it stays nested under expo's own node_modules and is otherwise
// unresolvable from the root. expo-doctor explicitly advises against adding
// expo-modules-core as a direct dependency just to force the hoist ("use the
// exported API from the expo package" instead), so this maps the module id
// straight to wherever it actually lives, scoped to the jest test
// environment only - no impact on the real app bundle.
const expoDir = path.dirname(require.resolve("expo/package.json"));
const expoModulesCoreDir = path.dirname(
  require.resolve("expo-modules-core/package.json", { paths: [expoDir] }),
);

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
        "^expo-modules-core$": expoModulesCoreDir,
      },
    },
  ],
};
