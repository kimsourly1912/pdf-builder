import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: [
      "app/**/*.tsx",
      "features/**/*.tsx",
      "components/patterns/**/*.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='select']",
          message:
            "Use shadcn Select (or SelectField) for application dropdowns. See docs/standards/ui.md.",
        },
        {
          selector: "JSXOpeningElement[name.name=/^NativeSelect/]",
          message:
            "Use shadcn Select for application dropdowns. NativeSelect is not the application standard.",
        },
      ],
    },
  },
  {
    files: [
      "app/**/*.tsx",
      "features/**/*.tsx",
      "components/patterns/**/*.tsx",
    ],
    // PDF-coordinate date fields preserve document geometry; ordinary forms do not qualify.
    ignores: ["app/pdf-editor.tsx", "features/templates/recipient-fill.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='select']",
          message:
            "Use shadcn Select or SelectField. See docs/standards/ui.md.",
        },
        {
          selector: "JSXOpeningElement[name.name=/^NativeSelect/]",
          message: "Use shadcn Select for application dropdowns.",
        },
        {
          selector: "JSXOpeningElement[name.name='datalist']",
          message:
            "Use a shadcn Select or combobox instead of native datalist suggestions.",
        },
        {
          selector:
            "JSXOpeningElement:has(JSXAttribute[name.name='type'][value.value=/^(date|datetime-local|time)$/])",
          message:
            "Use the shared shadcn DatePicker and Select time controls for application scheduling. See docs/standards/ui.md.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "worker-configuration.d.ts",
    ".wrangler/**",
  ]),
  {
    files: ["components/ui/**/*.{ts,tsx}", "hooks/use-mobile.ts"],
    rules: {
      // These files are vendored verbatim from shadcn@4.17.0. Keep the
      // registry source intact while applying the stricter rules to Site code.
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
