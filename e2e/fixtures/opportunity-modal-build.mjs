import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "bun";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

const outputDirectory = process.argv[2];
const result = await build({
  entrypoints: [resolve("e2e/fixtures/opportunity-modal-entry.tsx")],
  outdir: outputDirectory,
  target: "browser",
  define: { "process.env": JSON.stringify({ NODE_ENV: "development" }) },
  plugins: [
    {
      name: "opportunity-modal-service-double",
      setup(builder) {
        builder.onResolve({ filter: /^convex\/react$/ }, () => ({
          path: resolve("e2e/fixtures/opportunity-modal-convex.ts"),
        }));
        builder.onResolve({ filter: /^next\/navigation$/ }, () => ({
          path: resolve("e2e/fixtures/next-navigation.ts"),
        }));
        builder.onResolve({ filter: /^next\/link$/ }, () => ({
          path: resolve("e2e/fixtures/plain-next-link.tsx"),
        }));
        builder.onResolve({ filter: /^next\/image$/ }, () => ({
          path: resolve("e2e/fixtures/next-image.tsx"),
        }));
      },
    },
  ],
});
if (!result.success)
  throw new AggregateError(result.logs, "Opportunity modal fixture failed to bundle");
const cssPath = resolve("src/app/globals.css");
const css = await postcss([tailwindcss()]).process(await readFile(cssPath, "utf8"), {
  from: cssPath,
});
await writeFile(
  resolve(outputDirectory, "opportunity-modal.css"),
  // The app loads Host Grotesk through next/font, which a fixture page skips.
  `@import url("https://fonts.googleapis.com/css2?family=Host+Grotesk:wght@400;500;600&display=swap");\n${css.css}\n:root { --font-host-grotesk: "Host Grotesk", sans-serif; }`,
);
await writeFile(
  resolve(outputDirectory, "index.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Opportunity modal preview</title><link rel="stylesheet" href="opportunity-modal.css"></head><body><div id="root"></div><script type="module" src="opportunity-modal-entry.js"></script></body></html>`,
);
