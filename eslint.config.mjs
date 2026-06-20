import effectEslint from "@effect/eslint-plugin"
import { fixupPluginRules } from "@eslint/compat"
import tsParser from "@typescript-eslint/parser"
import tseslint from "typescript-eslint"
import functional from "eslint-plugin-functional"
import _import from "eslint-plugin-import"
import simpleImportSort from "eslint-plugin-simple-import-sort"
import importX from "eslint-plugin-import-x"
import sortDestructureKeys from "eslint-plugin-sort-destructure-keys"

const doubleAssertionSelector = {
  selector: "TSAsExpression > TSAsExpression",
  message: "Double type assertion (as A as B). Requires eslint-disable with justification."
}

const dateBanSelectors = [{
  selector: "NewExpression[callee.name='Date'][arguments.length=0]",
  message: "new Date() (zero-arg clock read) is banned. Use Effect DateTime.now or inject a now() port. `new Date(value)` for parsing domain-value strings is allowed."
}, {
  selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
  message: "Date.now() is banned. Use Effect Clock.currentTimeMillis or DateTime.now instead."
}]

const mockBanSelectors = [
  "fn",
  "clearAllMocks",
  "mock",
  "doMock",
  "unmock",
  "hoisted",
  "spyOn",
  "stubGlobal",
  "unstubAllGlobals",
  "mocked"
].map((member) => ({
  selector: `CallExpression[callee.object.name='vi'][callee.property.name='${member}']`,
  message:
    `vi.${member} is banned — tests must substitute behavior through Effect Layer / ports, not module monkey-patching. See CLAUDE.md \"No Test Mocks\".`
})).concat([{
  selector: "CallExpression[callee.object.name='jest'][callee.property.name='mock']",
  message: "jest.mock is banned — use dependency injection. See CLAUDE.md \"No Test Mocks\"."
}])

const schemaPrimitiveBanSelectors = [{
  selector: "MemberExpression[property.name='NonNegativeInt']",
  message:
    "Use NonNegativeInteger from src/domain/schemas/shared.ts instead of NonNegativeInt. Domain numeric primitives are centralized in shared.ts."
}, {
  selector: "MemberExpression[computed=true][property.value='NonNegativeInt']",
  message:
    "Use NonNegativeInteger from src/domain/schemas/shared.ts instead of NonNegativeInt. Domain numeric primitives are centralized in shared.ts."
}, {
  selector: "ObjectPattern Property[key.name='NonNegativeInt']",
  message:
    "Do not destructure NonNegativeInt. Use NonNegativeInteger from src/domain/schemas/shared.ts instead."
}, {
  selector: "ObjectPattern Property[computed=true][key.value='NonNegativeInt']",
  message:
    "Do not destructure NonNegativeInt. Use NonNegativeInteger from src/domain/schemas/shared.ts instead."
}]

const effectSchemaAliasBanSelectors = [{
  selector: "ImportDeclaration[source.value='effect'] ImportSpecifier[imported.name='Schema']:not([local.name='Schema'])",
  message:
    "Do not alias Schema imports from effect. ESLint guards domain schema primitives through the canonical Schema identifier."
}, {
  selector: "ImportDeclaration[source.value='effect'] ImportNamespaceSpecifier",
  message:
    "Do not namespace-import effect. Import Schema by name so ESLint can enforce centralized domain schema primitives."
}]

const restrictedSyntaxSelectors = [
  doubleAssertionSelector,
  ...dateBanSelectors,
  ...mockBanSelectors,
  ...effectSchemaAliasBanSelectors,
  ...schemaPrimitiveBanSelectors,
  {
    selector: "TSAsExpression:not([typeAnnotation.typeName.name='const'])",
    message:
      "Type assertion (as T) is banned. Use Effect Schema decode, satisfies, or restructure code to avoid the cast. If truly unavoidable at an SDK boundary, add eslint-disable with justification."
  }
]

const sharedSchemaRestrictedSyntaxSelectors = [
  doubleAssertionSelector,
  ...dateBanSelectors,
  ...mockBanSelectors,
  ...effectSchemaAliasBanSelectors,
  {
    selector: "TSAsExpression:not([typeAnnotation.typeName.name='const'])",
    message:
      "Type assertion (as T) is banned. Use Effect Schema decode, satisfies, or restructure code to avoid the cast. If truly unavoidable at an SDK boundary, add eslint-disable with justification."
  }
]

const testRestrictedSyntaxSelectors = [
  doubleAssertionSelector,
  ...dateBanSelectors,
  ...mockBanSelectors,
  ...effectSchemaAliasBanSelectors,
  ...schemaPrimitiveBanSelectors
]

const nonPropertyTestRestrictedSyntaxSelectors = [
  ...testRestrictedSyntaxSelectors,
  {
    selector: "ImportDeclaration[source.value='fast-check']",
    message: "Property-based tests must live in *.property.test.ts files."
  },
  {
    selector: "CallExpression[callee.object.name='fc'][callee.property.name='property']",
    message: "Move fc.property tests to a *.property.test.ts file."
  }
]

export default [
  {
    ignores: ["**/dist", "**/build", "**/*.md", "**/.reference", ".ralph/**"]
  },

  // TypeScript recommended
  ...tseslint.configs.recommended.map(config => ({
    ...config,
    files: ["src/**/*.ts", "test/**/*.ts"]
  })),

  // Effect dprint formatting rules
  ...effectEslint.configs.dprint.map(config => ({
    ...config,
    files: ["src/**/*.ts", "test/**/*.ts"]
  })),

  {
    files: ["src/**/*.ts", "test/**/*.ts"],

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
        project: "./tsconfig.lint.json",
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
      "@typescript-eslint/no-non-null-assertion": "error",
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
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "no-restricted-syntax": ["error", ...restrictedSyntaxSelectors],
      "no-restricted-imports": ["error", {
        paths: [{
          name: "@hcengineering/text",
          importNames: ["traverseAllMarks"],
          message:
            "Use traverseAllMarks from src/huly/operations/markup-traversal.ts so visitor arguments are readonly in application code."
        }]
      }],

      // Code quality
      "object-shorthand": "error",
      "sort-destructure-keys/sort-destructure-keys": "error",
      "max-lines": ["error", { max: 420, skipBlankLines: true, skipComments: true }],
      "functional/prefer-tacit": "error",
      "no-console": "warn",
      "no-magic-numbers": ["warn", {
        ignore: [0, 1, 1024],
        ignoreArrayIndexes: true,
        ignoreDefaultValues: true,
        enforceConst: true
      }],

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
  },

  {
    files: ["src/domain/schemas/shared.ts"],
    rules: {
      "no-restricted-syntax": ["error", ...sharedSchemaRestrictedSyntaxSelectors]
    }
  },

  // Dead export detection (import-x supports flat config, unlike import/no-unused-modules)
  {
    files: ["src/**/*.ts"],
    plugins: {
      "import-x": importX
    },
    settings: {
      "import-x/parsers": {
        "@typescript-eslint/parser": [".ts", ".tsx"]
      },
      "import-x/resolver": {
        typescript: {
          alwaysTryTypes: true
        }
      }
    },
    rules: {
      "import-x/no-unused-modules": ["error", { unusedExports: true }]
    }
  },

  {
    files: ["src/domain/schemas/**/*.ts"],
    rules: {
      // Schema modules define boundary contracts that are re-exported through the
      // barrel and consumed by generated JSON schemas, tool builders, and tests.
      "import-x/no-unused-modules": "off"
    }
  },

  {
    files: ["**/*.test.ts", "**/*.spec.ts"],
    rules: {
      "max-lines": "off",
      "no-magic-numbers": "off",
      "functional/immutable-data": "off",
      "@typescript-eslint/no-non-null-assertion": "warn",
      // Override: keep Date, mock and double-assertion bans; drop the general `as T` ban since test drivers need branded casts.
      "no-restricted-syntax": ["error", ...testRestrictedSyntaxSelectors]
    }
  },

  {
    files: ["test/**/*.test.ts", "test/**/*.spec.ts"],
    ignores: ["test/**/*.property.test.ts", "test/**/*.property.spec.ts"],
    rules: {
      "no-restricted-syntax": ["error", ...nonPropertyTestRestrictedSyntaxSelectors]
    }
  }
]
