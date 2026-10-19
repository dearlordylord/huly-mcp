import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { promisify } from "node:util"
import { Schema } from "effect"
import { afterAll, beforeAll, expect, it } from "vitest"

import { makeStdioBundleGrant } from "../../scripts/stdio-bundle-grant.js"
import { buildIsolatedStdioServer, StdioBundleGrant } from "./stdio-build.js"

const BUILD_BOUND = 30_000
const runFile = promisify(execFile)
let source: Awaited<ReturnType<typeof buildIsolatedStdioServer>>
let grant: string
beforeAll(async () => {
  source = await buildIsolatedStdioServer(BUILD_BOUND, () => undefined)
  grant = await makeStdioBundleGrant(source.path)
}, BUILD_BOUND)
afterAll(async () => {
  await source.cleanup()
})

it("copies a verified artifact independently for each suite", async () => {
  const first = await buildIsolatedStdioServer(BUILD_BOUND, () => grant)
  const second = await buildIsolatedStdioServer(BUILD_BOUND, () => grant)
  try {
    const original = await readFile(source.path)
    expect((await readFile(first.path)).equals(original)).toBe(true)
    expect((await readFile(second.path)).equals(original)).toBe(true)
    expect(new Set([source.path, first.path, second.path]).size).toBe(3)
    await writeFile(first.path, "suite-owned change")
    expect((await readFile(source.path)).equals(original)).toBe(true)
    expect((await readFile(second.path)).equals(original)).toBe(true)
  } finally {
    await Promise.all([first.cleanup(), second.cleanup()])
  }
})

it.each(["malformed", "missing", "mismatched"])("refuses a %s grant without building a replacement", async (mode) => {
  const input =
    mode === "malformed"
      ? "not-json"
      : Schema.encodeSync(Schema.fromJsonString(StdioBundleGrant))({
          path: mode === "missing" ? join(dirname(source.path), "missing.cjs") : source.path,
          sha256: "0".repeat(64)
        })
  await expect(buildIsolatedStdioServer(BUILD_BOUND, () => input)).rejects.toThrow()
})

it("builds exactly the package-script artifact in a separately owned directory", { timeout: BUILD_BOUND }, async () => {
  const bundle = await buildIsolatedStdioServer(BUILD_BOUND)
  try {
    const reference = join(dirname(bundle.path), "package-script.cjs")
    await runFile("pnpm", ["build:mcp", `--outfile=${reference}`], { timeout: BUILD_BOUND })
    const hashes = await Promise.all(
      [bundle.path, reference].map(async (path) =>
        createHash("sha256")
          .update(await readFile(path))
          .digest("hex")
      )
    )
    expect(hashes[0]).toBe(hashes[1])
  } finally {
    await bundle.cleanup()
  }
})
