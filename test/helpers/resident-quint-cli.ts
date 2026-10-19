import { copyFile, mkdtemp, rm } from "node:fs/promises"
import { dirname, join } from "node:path"
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
    return { cli: ResidentPackagePath.make(cli), cleanup }
  } catch (error) {
    await cleanup().catch(() => {
      process.stderr.write("Quint CLI preparation cleanup failed; private build directory retained\n")
    })
    throw error
  }
}
