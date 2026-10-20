import { makeStdioBundleGrant } from "../../scripts/stdio-bundle-grant.js"
import type { TestProject } from "vitest/node"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { buildIsolatedStdioServer } from "../helpers/stdio-build.js"

const BUILD_BOUND = 30_000

export default async function setup(project: TestProject) {
  if (!project.vitest.config.coverage.enabled) return
  const source = await buildIsolatedStdioServer(BUILD_BOUND)
  const cache = await mkdtemp(join(tmpdir(), "huly-subprocess-bytecode-")).catch(async (error: unknown) => {
    await source.cleanup()
    throw error
  })
  const previous = project.config.env.HULY_TEST_STDIO_BUNDLE
  const previousCache = project.config.env.HULY_TEST_SUBPROCESS_COMPILE_CACHE
  try {
    project.config.env.HULY_TEST_STDIO_BUNDLE = await makeStdioBundleGrant(source.path)
    project.config.env.HULY_TEST_SUBPROCESS_COMPILE_CACHE = cache
  } catch (error) {
    try {
      await source.cleanup()
    } finally {
      await rm(cache, { recursive: true, force: true })
    }
    throw error
  }
  return async () => {
    if (previous === undefined) delete project.config.env.HULY_TEST_STDIO_BUNDLE
    else project.config.env.HULY_TEST_STDIO_BUNDLE = previous
    if (previousCache === undefined) delete project.config.env.HULY_TEST_SUBPROCESS_COMPILE_CACHE
    else project.config.env.HULY_TEST_SUBPROCESS_COMPILE_CACHE = previousCache
    // Only the setup-owned source is removed; each suite owns its executable copy.
    try {
      await source.cleanup()
    } finally {
      await rm(cache, { recursive: true, force: true })
    }
  }
}
