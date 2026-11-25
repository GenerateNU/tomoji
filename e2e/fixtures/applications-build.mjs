import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "bun";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

const outputDirectory = process.argv[2];
const result = await build({
  entrypoints: [resolve("e2e/fixtures/applications-entry.tsx")],
  outdir: outputDirectory,
  target: "browser",
  define: { "process.env": JSON.stringify({ NODE_ENV: "development" }) },
  plugins: [
    {
      name: "applications-service-double",
      setup(builder) {
        builder.onResolve({ filter: /^convex\/react$/ }, () => ({
          path: resolve("e2e/fixtures/applications-convex.ts"),
        }));
        builder.onResolve({ filter: /^next\/navigation$/ }, () => ({
          path: resolve("e2e/fixtures/next-navigation.ts"),
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
  `${css.css}\n:root { --font-host-grotesk: Arial, sans-serif; }`,
);
