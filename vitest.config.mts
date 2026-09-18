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
          server: { deps: { inline: ["convex-test"] } },
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
