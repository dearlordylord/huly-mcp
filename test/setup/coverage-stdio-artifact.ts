import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { Schema } from "effect"
import type { TestProject } from "vitest/node"

import { buildIsolatedStdioServer, StdioBundleGrant } from "../helpers/stdio-build.js"

const BUILD_BOUND = 30_000

export default async function setup(project: TestProject) {
  if (!project.vitest.config.coverage.enabled) return
  const source = await buildIsolatedStdioServer(BUILD_BOUND)
  const previous = project.config.env.HULY_TEST_STDIO_BUNDLE
  try {
    const bytes = await readFile(source.path)
    project.config.env.HULY_TEST_STDIO_BUNDLE = Schema.encodeSync(Schema.fromJsonString(StdioBundleGrant))({
      path: source.path,
      sha256: createHash("sha256").update(bytes).digest("hex")
    })
  } catch (error) {
    await source.cleanup()
    throw error
  }
  return async () => {
    if (previous === undefined) delete project.config.env.HULY_TEST_STDIO_BUNDLE
    else project.config.env.HULY_TEST_STDIO_BUNDLE = previous
    // Only the setup-owned source is removed; each suite owns its executable copy.
    await source.cleanup()
  }
}
