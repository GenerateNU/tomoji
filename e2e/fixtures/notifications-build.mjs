import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "bun";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

// Real UI with an isolated Convex service double, matching the settings browser fixtures.
const outputDirectory = process.argv[2];
const result = await build({
  entrypoints: [resolve("e2e/fixtures/notifications-entry.tsx")],
  outdir: outputDirectory,
  target: "browser",
  define: { "process.env": JSON.stringify({ NODE_ENV: "development" }) },
  plugins: [
    {
      name: "notifications-convex-fixture",
      setup(builder) {
        builder.onResolve({ filter: /^convex\/react$/ }, () => ({
          path: resolve("e2e/fixtures/notifications-convex.ts"),
        }));
      },
    },
  ],
});
if (!result.success)
  throw new AggregateError(result.logs, "Notifications fixture failed to bundle");
const cssPath = resolve("src/app/globals.css");
const css = await postcss([tailwindcss()]).process(await readFile(cssPath, "utf8"), {
  from: cssPath,
});
await writeFile(
  resolve(outputDirectory, "notifications.css"),
  `${css.css}\n:root { --font-inter: Arial, sans-serif; }`,
);
