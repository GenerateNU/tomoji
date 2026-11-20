import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "bun";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

// Production home and shell, with test-only services. No application auth is replaced.
const outputDirectory = process.argv[2];
const replacements = {
  "convex/react": "company-home-convex.ts",
  "next/navigation": "next-navigation.ts",
  "next/link": "plain-next-link.tsx",
  "next/image": "next-image.tsx",
  "@/app/auth/actions": "settings-auth.ts",
};
const result = await build({
  entrypoints: [resolve("e2e/fixtures/company-home-entry.tsx")],
  outdir: outputDirectory,
  target: "browser",
  define: { "process.env": JSON.stringify({ NODE_ENV: "development" }) },
  plugins: [
    {
      name: "company-home-fixture",
      setup(builder) {
        for (const [name, path] of Object.entries(replacements)) {
          builder.onResolve(
            { filter: new RegExp("^" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$") },
            () => ({ path: resolve("e2e/fixtures", path) }),
          );
        }
      },
    },
  ],
});
if (!result.success) throw new AggregateError(result.logs, "Company home fixture failed to bundle");
const cssPath = resolve("src/app/globals.css");
const css = await postcss([tailwindcss()]).process(await readFile(cssPath, "utf8"), {
  from: cssPath,
});
await writeFile(
  resolve(outputDirectory, "company-home.css"),
  `@import url("https://fonts.googleapis.com/css2?family=Host+Grotesk:wght@400;500;600&display=swap");\n${css.css}\n:root { --font-host-grotesk: "Host Grotesk", sans-serif; }`,
);
