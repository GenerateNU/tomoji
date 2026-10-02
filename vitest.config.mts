import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        // Convex function tests (convex-test). Must run under edge-runtime —
        // see convex/_generated/ai/guidelines.md.
        test: {
          name: "convex",
          environment: "edge-runtime",
          include: ["convex/tests/**/*.test.ts"],
          exclude: ["convex/tests/lib/s3.test.ts", "convex/tests/mediaActions.test.ts"],
          server: { deps: { inline: ["convex-test"] } },
        },
      },
      {
        // The S3 SDK and signing helpers run in Convex's Node.js action runtime.
        test: {
          name: "convex-node",
          environment: "node",
          include: ["convex/tests/lib/s3.test.ts", "convex/tests/mediaActions.test.ts"],
        },
      },
      {
        // Everything else: pure units, helpers, stage-machine logic.
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
        },
      },
    ],
  },
});
