import tsParser from "@typescript-eslint/parser"
import tseslint from "typescript-eslint"
import functional from "eslint-plugin-functional"

export default [{
  ignores: ["**/.reference", "**/build", "**/coverage", "**/dist", "**/node_modules"]
}, {
  files: ["src/**/*.ts", "packages/**/src/**/*.ts"],
  ignores: ["**/*.test.ts", "**/*.spec.ts"],
  linterOptions: {
    reportUnusedDisableDirectives: "off"
  },
  languageOptions: {
    parser: tsParser
  },
  plugins: {
    "@typescript-eslint": tseslint.plugin,
    functional
  },
  rules: {
    complexity: ["error", { max: 31, variant: "classic" }]
  }
}]
