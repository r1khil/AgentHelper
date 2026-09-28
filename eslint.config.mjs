import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import typeScale from "./scripts/eslint/type-scale.mjs";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { owl: { rules: { "type-scale": typeScale } } },
    rules: {
      // Font sizes come from the type scale in globals.css; see scripts/codemods/type-scale.mjs.
      "owl/type-scale": "error",
      // The cn in @/lib/utils knows the type scale's names; the stock one would drop text-body next to a text color.
      "no-restricted-imports": ["error", { paths: [{ name: "cn", importNames: ["cn"], message: "Import cn from \"@/lib/utils\" (it knows the type scale)." }] }],
    },
  },
  { files: ["src/lib/utils.ts"], rules: { "no-restricted-imports": "off" } },
  globalIgnores([".next/**", ".artifacts/**", "node_modules/**", "drizzle/**"]),
]);
