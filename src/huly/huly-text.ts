// Centralized CJS require() interop for @hcengineering/text runtime exports.
// The package's CommonJS entry exposes these values, while unbundled ESM execution
// through tsx does not provide stable named runtime exports.

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports, no-restricted-syntax -- CJS interop boundary mirrors huly-plugins.ts */

const text = require("@hcengineering/text") as typeof import("@hcengineering/text")

export const jsonToMarkup = text.jsonToMarkup
export const htmlToJSON = text.htmlToJSON
export const jsonToHTML = text.jsonToHTML
export const MarkupMarkType = text.MarkupMarkType
export const MarkupNodeType = text.MarkupNodeType
export const markupToJSON = text.markupToJSON

/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports, no-restricted-syntax */
