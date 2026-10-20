import { copyFile, mkdtemp, rm } from "node:fs/promises"
import { dirname, join } from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { build } from "esbuild"

import { ResidentPackagePath } from "../../src/resident/managed-contract.js"

// Preparation is separate from the unchanged four-second model execution bound.
export const prepareResidentQuintCli = async () => {
  const source = join(process.cwd(), "node_modules/@informalsystems/quint/dist/src/cli.js")
  const directory = await mkdtemp(join(process.cwd(), "dist/resident-quint-cli-"))
  const cli = join(directory, "cli.cjs")
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
      {
        timeout: 30_000,
        killSignal: "SIGKILL",
        env: { ...process.env, NODE_COMPILE_CACHE: join(directory, "compile-cache") }
      }
    )
    return { cli: ResidentPackagePath.make(cli), cleanup }
  } catch (error) {
    await cleanup().catch(() => {
      process.stderr.write("Quint CLI preparation cleanup failed; private build directory retained\n")
    })
    throw error
  }
}
