// Centralized CJS require() interop for @hcengineering/text-markdown runtime exports.
// The package's CommonJS entry exposes these values, while unbundled ESM execution
// through tsx does not provide stable named runtime exports.

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports, no-restricted-syntax -- CJS interop boundary mirrors huly-plugins.ts */

const textMarkdown = require("@hcengineering/text-markdown") as typeof import("@hcengineering/text-markdown")

export const markdownToMarkup = textMarkdown.markdownToMarkup
export const markupToMarkdown = textMarkdown.markupToMarkdown

/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports, no-restricted-syntax */
