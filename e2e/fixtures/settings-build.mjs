import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "bun";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

// Bundle the real client components with a test-only Convex adapter and a
// plain-<img> stand-in for next/image. Nothing here is exposed by Next.js or
// changes the application's authentication.
const outputDirectory = process.argv[2];
const result = await build({
  entrypoints: [resolve(process.argv[3] ?? "e2e/fixtures/settings-entry.tsx")],
  outdir: outputDirectory,
  target: "browser",
  define: { "process.env": JSON.stringify({ NODE_ENV: "development" }) },
  plugins: [
    {
      name: "settings-convex-fixture",
      setup(builder) {
        builder.onResolve({ filter: /^convex\/react$/ }, () => ({
          path: resolve("e2e/fixtures/settings-convex.ts"),
        }));
        builder.onResolve({ filter: /^next\/image$/ }, () => ({
          path: resolve("e2e/fixtures/next-image.tsx"),
        }));
      },
    },
  ],
});
if (!result.success) throw new AggregateError(result.logs, "Settings fixture failed to bundle");

const cssPath = resolve("src/app/globals.css");
const css = await postcss([tailwindcss()]).process(await readFile(cssPath, "utf8"), {
  from: cssPath,
});
// Next normally supplies these font variables through the root layout.
// Use local fallbacks so browser tests don't fetch fonts from Google.
await writeFile(
  resolve(outputDirectory, "settings.css"),
  `${css.css}\n:root { --font-inter: Arial, sans-serif; --font-geist-mono: monospace; }`,
);
