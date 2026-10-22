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
  const previous = project.vitest.projects.map((target) => ({
    target,
    bundle: target.config.env.HULY_TEST_STDIO_BUNDLE,
    cache: target.config.env.HULY_TEST_SUBPROCESS_COMPILE_CACHE
  }))
  try {
    const grant = await makeStdioBundleGrant(source.path)
    for (const { target } of previous) {
      target.config.env.HULY_TEST_STDIO_BUNDLE = grant
      target.config.env.HULY_TEST_SUBPROCESS_COMPILE_CACHE = cache
    }
  } catch (error) {
    try {
      await source.cleanup()
    } finally {
      await rm(cache, { recursive: true, force: true })
    }
    throw error
  }
  return async () => {
    for (const { bundle, cache: previousCache, target } of previous) {
      if (bundle === undefined) delete target.config.env.HULY_TEST_STDIO_BUNDLE
      else target.config.env.HULY_TEST_STDIO_BUNDLE = bundle
      if (previousCache === undefined) delete target.config.env.HULY_TEST_SUBPROCESS_COMPILE_CACHE
      else target.config.env.HULY_TEST_SUBPROCESS_COMPILE_CACHE = previousCache
    }
    // Only the setup-owned source is removed; each suite owns its executable copy.
    try {
      await source.cleanup()
    } finally {
      await rm(cache, { recursive: true, force: true })
    }
  }
}
