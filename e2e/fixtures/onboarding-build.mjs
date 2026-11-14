import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "bun";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

// The real onboarding components, with Convex and Next's router swapped for
// test doubles. Nothing here is served by Next.js or affects authentication.
const outputDirectory = process.argv[2];
const result = await build({
  entrypoints: [resolve("e2e/fixtures/onboarding-entry.tsx")],
  outdir: outputDirectory,
  target: "browser",
  define: { "process.env": JSON.stringify({ NODE_ENV: "development" }) },
  plugins: [
    {
      name: "onboarding-fixture",
      setup(builder) {
        builder.onResolve({ filter: /^convex\/react$/ }, () => ({
          path: resolve("e2e/fixtures/onboarding-convex.ts"),
        }));
        builder.onResolve({ filter: /^next\/navigation$/ }, () => ({
          path: resolve("e2e/fixtures/onboarding-navigation.ts"),
        }));
        builder.onResolve({ filter: /^next\/image$/ }, () => ({
          path: resolve("e2e/fixtures/next-image.tsx"),
        }));
      },
    },
  ],
});
if (!result.success) throw new AggregateError(result.logs, "Onboarding fixture failed to bundle");

const cssPath = resolve("src/app/globals.css");
const css = await postcss([tailwindcss()]).process(await readFile(cssPath, "utf8"), {
  from: cssPath,
});
await writeFile(
  resolve(outputDirectory, "onboarding.css"),
  `${css.css}\n:root { --font-inter: Arial, sans-serif; --font-geist-mono: monospace; }`,
);
