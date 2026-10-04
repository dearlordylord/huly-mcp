import { execFile } from "node:child_process"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"

const runFile = promisify(execFile)

// Each suite owns its bundle: parallel builds cannot rewrite a running child's entrypoint.
export const buildIsolatedStdioServer = async (timeout: number) => {
  const outputDirectory = join(process.cwd(), "dist")
  await mkdir(outputDirectory, { recursive: true })
  const directory = await mkdtemp(join(outputDirectory, "stdio-suite-"))
  const path = join(directory, "index.cjs")
  const cleanup = () => rm(directory, { recursive: true, force: true })
  try {
    await runFile("pnpm", ["build:mcp", `--outfile=${path}`], { cwd: process.cwd(), timeout })
    return { path, cleanup }
  } catch (error) {
    await cleanup()
    throw error
  }
}
