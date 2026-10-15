import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "bun";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

// Like the settings PR's browser fixture: real components, no auth bypass or live writes.
const outputDirectory = process.argv[2];
const result = await build({
  entrypoints: [resolve("e2e/fixtures/applications-entry.tsx")],
  outdir: outputDirectory,
  target: "browser",
  define: { "process.env": JSON.stringify({ NODE_ENV: "development" }) },
  plugins: [
    {
      name: "applications-convex-fixture",
      setup(builder) {
        builder.onResolve({ filter: /^convex\/react$/ }, () => ({
          path: resolve("e2e/fixtures/applications-convex.ts"),
        }));
      },
    },
  ],
});
if (!result.success) throw new AggregateError(result.logs, "Applications fixture failed to bundle");
const cssPath = resolve("src/app/globals.css");
const css = await postcss([tailwindcss()]).process(await readFile(cssPath, "utf8"), {
  from: cssPath,
});
await writeFile(
  resolve(outputDirectory, "applications.css"),
  `${css.css}\n:root { --font-inter: Arial, sans-serif; --font-geist-mono: monospace; }`,
);
