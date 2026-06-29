// Centralized CJS require() interop for @hcengineering/platform runtime exports.
// Some Huly packages expose CommonJS values that are not stable as unbundled ESM named exports.

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports, no-restricted-syntax -- CJS interop boundary mirrors huly-plugins.ts */

const platform = require("@hcengineering/platform") as typeof import("@hcengineering/platform")

export const PlatformError = platform.PlatformError

/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports, no-restricted-syntax */
