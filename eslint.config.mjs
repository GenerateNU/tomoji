import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsdoc from "eslint-plugin-jsdoc";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Convex codegen — regenerated on every `convex dev`, not ours to lint.
    "convex/_generated/**",
  ]),
  {
    files: ["convex/*.ts"],
    plugins: { jsdoc },
    rules: {
      "jsdoc/check-tag-names": [
        "error",
        { definedTags: ["confirm", "permission", "see", "throws", "returns"] },
      ],
      "jsdoc/require-jsdoc": [
        "error",
        {
          require: { FunctionDeclaration: false },
          contexts: [
            "ExportNamedDeclaration[declaration.declarations.0.init.callee.name=/^(query|mutation|action|authedQuery|authedMutation|creatorQuery|creatorMutation|companyQuery|companyMutation|operatorQuery|operatorMutation)$/]",
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
