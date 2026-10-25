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
        // Everything else: pure units, helpers, stage-machine logic. Tests live
        // in src/tests/, mirroring the source path, so they reach their subject
        // through the same aliases tsconfig.json defines rather than by
        // climbing out of the folder with ../../.
        resolve: {
          alias: {
            "@/": new URL("./src/", import.meta.url).pathname,
            "@convex/": new URL("./convex/", import.meta.url).pathname,
          },
        },
        test: {
          name: "frontend",
          environment: "node",
          include: ["src/tests/**/*.test.ts", "src/tests/**/*.test.tsx"],
        },
      },
      {
        // Setup scripts. Their own project so `--project frontend` means only
        // the frontend: a path filter cannot separate them, because
        // `scripts/tests/` matches any filter containing "tests".
        test: {
          name: "scripts",
          environment: "node",
          include: ["scripts/tests/**/*.test.ts"],
        },
      },
    ],
  },
});
