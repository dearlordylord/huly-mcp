/**
 * Global polyfills for Node.js environment.
 *
 * @hcengineering packages assume a browser-like environment.
 * These polyfills provide the minimum required browser globals
 * (indexedDB, window, navigator) so the packages work in Node.js.
 *
 * The `as Record<string, unknown>` casts are necessary because
 * globalThis doesn't include browser-only globals in its Node.js type.
 * The eslint-disable for immutable-data is needed because polyfills
 * must mutate globalThis by definition.
 */

/* eslint-disable functional/immutable-data */
import fakeIndexedDB from "fake-indexeddb"
;(globalThis as Record<string, unknown>).indexedDB = fakeIndexedDB

// dirtiest hack here. current api package is frontend-oriented, but we somehow run it on the server and it somehow works. hooray?
const mockWindow: Record<string, unknown> = {
  addEventListener: () => {},
  removeEventListener: () => {},
  location: { href: "" },
  document: {}
}
;(globalThis as Record<string, unknown>).window = mockWindow

if (!(globalThis as Record<string, unknown>).navigator) {
  Object.defineProperty(globalThis, "navigator", {
    value: { userAgent: "node" },
    writable: true,
    configurable: true
  })
}
