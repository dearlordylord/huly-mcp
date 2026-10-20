import { makeStdioBundleGrant } from "../../scripts/stdio-bundle-grant.js"
import type { TestProject } from "vitest/node"

import { buildIsolatedStdioServer } from "../helpers/stdio-build.js"

const BUILD_BOUND = 30_000

export default async function setup(project: TestProject) {
  if (!project.vitest.config.coverage.enabled) return
  const source = await buildIsolatedStdioServer(BUILD_BOUND)
  const previous = project.config.env.HULY_TEST_STDIO_BUNDLE
  try {
    project.config.env.HULY_TEST_STDIO_BUNDLE = await makeStdioBundleGrant(source.path)
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
