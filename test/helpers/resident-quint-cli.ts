import { copyFile, mkdtemp, readdir, rm } from "node:fs/promises"
import { dirname, join } from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { build } from "esbuild"
import type { Schema } from "effect"

import { ResidentPackagePath } from "../../src/resident/managed-contract.js"

export const quintSubprocessEnvironment = (cli: Schema.Schema.Type<typeof ResidentPackagePath>) => {
  const env = { ...process.env }
  // Quint is not instrumented; keep Vitest's coverage cache prohibition in the parent only.
  delete env.NODE_DISABLE_COMPILE_CACHE
  return { ...env, NODE_COMPILE_CACHE: join(dirname(cli), "compile-cache") }
}

// Preparation is separate from the unchanged four-second model execution bound.
export const prepareResidentQuintCli = async () => {
  const source = join(process.cwd(), "node_modules/@informalsystems/quint/dist/src/cli.js")
  const directory = await mkdtemp(join(process.cwd(), "dist/resident-quint-cli-"))
  const cli = ResidentPackagePath.make(join(directory, "cli.cjs"))
  const cleanup = () => rm(directory, { recursive: true, force: true })
  try {
    await build({
      entryPoints: [source],
      outfile: cli,
      bundle: true,
      platform: "node",
      format: "cjs",
      external: ["./reflection.proto"],
      logLevel: "warning"
    })
    for (const asset of ["builtin.qnt", "reflection.proto"])
      await copyFile(join(dirname(source), asset), join(directory, asset))
    // Warm the evaluator too; each real replay still runs fresh within its four-second bound.
    await promisify(execFile)(
      process.execPath,
      [
        cli,
        "test",
        join(process.cwd(), "quint-specs/resident-launch-observations_test.qnt"),
        "--backend=typescript",
        "--match",
        "ordinaryOwnerObservationTest$",
        "--max-samples=1"
      ],
      { timeout: 30_000, killSignal: "SIGKILL", env: quintSubprocessEnvironment(cli) }
    )
    const cached = await readdir(join(directory, "compile-cache"), { recursive: true, withFileTypes: true })
    if (!cached.some((entry) => entry.isFile())) throw new Error("Quint preparation did not produce bytecode cache")
    return { cli, cleanup }
  } catch (error) {
    await cleanup().catch(() => {
      process.stderr.write("Quint CLI preparation cleanup failed; private build directory retained\n")
    })
    throw error
  }
}
