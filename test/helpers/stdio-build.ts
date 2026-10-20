import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { createRequire } from "node:module"
import { promisify } from "node:util"
import { createHash } from "node:crypto"
import { Schema } from "effect"
import { StdioBundleGrant } from "../../scripts/stdio-bundle-grant.js"

const runFile = promisify(execFile)
export const ESBUILD_EXECUTABLE = createRequire(import.meta.url).resolve("esbuild/bin/esbuild")
export const NATIVE_RUNTIME_EXTERNALS = ["--external:ws", "--external:@napi-rs/keyring", "--external:dbus-next"]
export { StdioBundleGrant } from "../../scripts/stdio-bundle-grant.js"
const parseGrant = Schema.decodeUnknownSync(Schema.UndefinedOr(Schema.fromJsonString(StdioBundleGrant)))

// Each suite owns its bundle: parallel builds cannot rewrite a running child's entrypoint.
export const buildIsolatedStdioServer = async (
  timeout: number,
  readGrant: () => string | undefined = () => process.env.HULY_TEST_STDIO_BUNDLE
) => {
  const outputDirectory = join(process.cwd(), "dist")
  await mkdir(outputDirectory, { recursive: true })
  const directory = await mkdtemp(join(outputDirectory, "stdio-suite-"))
  const path = join(directory, "index.cjs")
  const cleanup = () => rm(directory, { recursive: true, force: true })
  try {
    const grant = parseGrant(readGrant())
    if (grant === undefined) {
      await runFile("pnpm", ["build:mcp", `--outfile=${path}`], { cwd: process.cwd(), timeout })
    } else {
      const bytes = await readFile(grant.path)
      if (createHash("sha256").update(bytes).digest("hex") !== grant.sha256)
        throw new Error("Coverage bundle grant does not match its artifact")
      await writeFile(path, bytes, { flag: "wx", mode: 0o700 })
      await mkdir(join(directory, "native"))
      for (const companion of grant.companions) {
        const content = await readFile(join(dirname(grant.path), companion.path))
        if (createHash("sha256").update(content).digest("hex") !== companion.sha256)
          throw new Error("Coverage companion grant does not match its artifact")
        await writeFile(join(directory, companion.path), content, { flag: "wx", mode: companion.mode })
      }
    }
    return { path, cleanup }
  } catch (error) {
    await cleanup()
    throw error
  }
}
