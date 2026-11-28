import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "bun";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

// Bundles the real Posts page inside the app shell with a test-only Convex
// adapter. The query cache hooks resolve to the same adapter, since the
// fixture has no Convex client for the cache to subscribe through.
const outputDirectory = process.argv[2];
const result = await build({
  entrypoints: [resolve("e2e/fixtures/posts-entry.tsx")],
  outdir: outputDirectory,
  target: "browser",
  define: { "process.env": JSON.stringify({ NODE_ENV: "development" }) },
  plugins: [
    {
      name: "posts-convex-fixture",
      setup(builder) {
        builder.onResolve({ filter: /^convex\/react$/ }, () => ({
          path: resolve("e2e/fixtures/posts-convex.ts"),
        }));
        builder.onResolve({ filter: /^convex-helpers\/react\/cache\/hooks$/ }, () => ({
          path: resolve("e2e/fixtures/posts-convex.ts"),
        }));
        builder.onResolve({ filter: /^next\/image$/ }, () => ({
          path: resolve("e2e/fixtures/next-image.tsx"),
        }));
        builder.onResolve({ filter: /^next\/link$/ }, () => ({
          path: resolve("e2e/fixtures/plain-next-link.tsx"),
        }));
        builder.onResolve({ filter: /^next\/navigation$/ }, () => ({
          path: resolve("e2e/fixtures/settings-navigation.ts"),
        }));
        builder.onResolve({ filter: /^@\/app\/auth\/actions$/ }, () => ({
          path: resolve("e2e/fixtures/settings-auth.ts"),
        }));
      },
    },
  ],
});
if (!result.success) throw new AggregateError(result.logs, "Posts fixture failed to bundle");

const cssPath = resolve("src/app/globals.css");
const css = await postcss([tailwindcss()]).process(await readFile(cssPath, "utf8"), {
  from: cssPath,
});
// Next normally supplies these font variables through the root layout.
await writeFile(
  resolve(outputDirectory, "posts.css"),
  `${css.css}\n:root { --font-host-grotesk: Arial, sans-serif; --font-geist-mono: monospace; }`,
);
