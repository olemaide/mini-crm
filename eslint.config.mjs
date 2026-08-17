import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import i18next from "eslint-plugin-i18next";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    name: "mini-crm/i18n",
    /*
     * Enforces build-plan §3 rule 10: no hardcoded user-facing strings.
     *
     * The whole value of scaffolding i18n in Phase 0 is that strings never
     * accumulate untranslated. A linter enforces that; good intentions do not.
     *
     * `jsx-text-only` targets visible text nodes and leaves className, test ids
     * and other non-user-facing literals alone — enough signal, little noise.
     */
    files: ["src/**/*.tsx"],
    ignores: [
      // Vendored shadcn/ui source. Not ours to translate, and it is regenerated
      // on every `shadcn add --overwrite`. Translated labels are passed in as
      // props from our own components instead.
      "src/components/ui/**",
    ],
    plugins: { i18next },
    rules: {
      "i18next/no-literal-string": [
        "error",
        {
          mode: "jsx-text-only",
          "should-validate-template": false,
          words: {
            // Punctuation, separators and symbols carry no language.
            exclude: ["^[^\\p{L}]*$", "^[·—–…]$"],
          },
        },
      ],
    },
  },

  {
    name: "mini-crm/server-boundaries",
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      /*
       * Environment access goes through the validated `@/env` module so a
       * missing variable fails the build instead of surfacing as `undefined`
       * at runtime. NEXT_PUBLIC_ inlining and Node-internal vars are exempt.
       */
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "Import the validated `env` from '@/env' instead of reading process.env directly.",
        },
      ],
    },
  },

  {
    name: "mini-crm/env-module-exception",
    files: ["src/env.ts", "next.config.ts", "scripts/**/*.ts", "src/app/api/health/route.ts"],
    rules: { "no-restricted-properties": "off" },
  },

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "supabase/**",
    "messages.d.ts",
  ]),
]);

export default eslintConfig;
