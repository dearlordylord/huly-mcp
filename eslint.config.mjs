import effectEslint from "@effect/eslint-plugin"
import { fixupPluginRules } from "@eslint/compat"
import tsParser from "@typescript-eslint/parser"
import tseslint from "typescript-eslint"
import functional from "eslint-plugin-functional"
import _import from "eslint-plugin-import"
import simpleImportSort from "eslint-plugin-simple-import-sort"
import sortDestructureKeys from "eslint-plugin-sort-destructure-keys"

export default [
  {
    ignores: ["**/dist", "**/build", "**/*.md", "**/.reference"]
  },

  // TypeScript recommended
  ...tseslint.configs.recommended,

  // Effect dprint formatting rules
  ...effectEslint.configs.dprint,

  {
    plugins: {
      functional,
      import: fixupPluginRules(_import),
      "simple-import-sort": simpleImportSort,
      "sort-destructure-keys": sortDestructureKeys
    },

    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname
      }
    },

    settings: {
      "import/parsers": {
        "@typescript-eslint/parser": [".ts", ".tsx"]
      },
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true
        }
      }
    },

    rules: {
      // Import organization
      "import/first": "error",
      "import/no-duplicates": "error",
      "import/newline-after-import": "off", // dprint handles formatting
      "simple-import-sort/imports": "off", // conflicts with dprint import ordering

      // TypeScript best practices - strict type assertion rules
      "@typescript-eslint/consistent-type-imports": "warn",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/consistent-type-assertions": ["error", {
        assertionStyle: "as",
        objectLiteralTypeAssertions: "allow-as-parameter"
      }],
      "@typescript-eslint/array-type": ["warn", {
        default: "generic",
        readonly: "generic"
      }],
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_"
      }],
      "@typescript-eslint/no-floating-promises": "error",

      // Code quality
      "object-shorthand": "error",
      "sort-destructure-keys/sort-destructure-keys": "error",
      "no-console": "warn",

      // Functional programming
      ...functional.configs.recommended.rules,
      "functional/no-throw-statements": "off",
      "functional/immutable-data": "warn",

      // Turn off FP rules that conflict with Effect patterns
      "functional/no-expression-statements": "off",
      "functional/functional-parameters": "off",
      "functional/no-classes": "off",
      "functional/no-class-inheritance": "off",
      "functional/no-conditional-statements": "off",
      "functional/no-return-void": "off",
      "functional/prefer-immutable-types": "off",
      "functional/no-let": "off",
      "functional/no-loop-statements": "off",

      // Effect dprint formatting
      "@effect/dprint": ["error", {
        config: {
          indentWidth: 2,
          lineWidth: 120,
          semiColons: "asi",
          quoteStyle: "alwaysDouble",
          trailingCommas: "never"
        }
      }]
    }
  }
]
