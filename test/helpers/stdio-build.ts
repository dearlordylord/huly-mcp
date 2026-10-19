import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { isAbsolute, join } from "node:path"
import { promisify } from "node:util"
import { createHash } from "node:crypto"
import { Schema } from "effect"

const runFile = promisify(execFile)
export const StdioBundleGrant = Schema.Struct({
  path: Schema.NonEmptyString.check(Schema.makeFilter(isAbsolute)),
  sha256: Schema.String.check(Schema.makeFilter((value) => /^[0-9a-f]{64}$/.test(value)))
})
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
    }
    return { path, cleanup }
  } catch (error) {
    await cleanup()
    throw error
  }
}
