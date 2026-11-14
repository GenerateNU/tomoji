import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "bun";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

// Real operator views with an isolated Convex service double.
const outputDirectory = process.argv[2];
const result = await build({
  entrypoints: [resolve("e2e/fixtures/operator-entry.tsx")],
  outdir: outputDirectory,
  target: "browser",
  define: { "process.env": JSON.stringify({ NODE_ENV: "development" }) },
  plugins: [
    {
      name: "operator-fixture",
      setup(builder) {
        builder.onResolve({ filter: /^convex\/react$/ }, () => ({
          path: resolve("e2e/fixtures/operator-convex.ts"),
        }));
        builder.onResolve({ filter: /^next\/navigation$/ }, () => ({
          path: resolve("e2e/fixtures/onboarding-navigation.ts"),
        }));
      },
    },
  ],
});
if (!result.success) throw new AggregateError(result.logs, "Operator fixture failed to bundle");
const cssPath = resolve("src/app/globals.css");
const css = await postcss([tailwindcss()]).process(await readFile(cssPath, "utf8"), {
  from: cssPath,
});
await writeFile(
  resolve(outputDirectory, "operator.css"),
  `${css.css}\n:root { --font-inter: Arial, sans-serif; }`,
);
