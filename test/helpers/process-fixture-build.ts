import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"

import { ESBUILD_EXECUTABLE, NATIVE_RUNTIME_EXTERNALS } from "./stdio-build.js"
import { prepareSubprocessBytecode, runPreparationFile } from "./subprocess-bytecode.js"

export const buildIsolatedProcessFixture = async (source: string, timeout: number) => {
  const signal = AbortSignal.timeout(timeout)
  const output = join(process.cwd(), "dist")
  await mkdir(output, { recursive: true })
  const directory = await mkdtemp(join(output, "process-fixture-"))
  const path = join(directory, "fixture.cjs")
  const cleanup = () => rm(directory, { recursive: true, force: true })
  try {
    await runPreparationFile(
      ESBUILD_EXECUTABLE,
      [source, "--bundle", "--platform=node", "--format=cjs", ...NATIVE_RUNTIME_EXTERNALS, `--outfile=${path}`],
      signal
    )
    await prepareSubprocessBytecode(path, signal)
    return { path, cleanup }
  } catch (error) {
    await cleanup()
    throw error
  }
}
