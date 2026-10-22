import { execFile } from "node:child_process"
import { promisify } from "node:util"

import { testStdioEnvironment } from "./stdio-environment.js"

export const runPreparationFile = async (
  executable: string,
  args: ReadonlyArray<string>,
  signal: AbortSignal,
  env = process.env
) => {
  const running = promisify(execFile)(executable, args, { signal, killSignal: "SIGKILL", env })
  const closed = new Promise<void>((accept) => running.child.once("close", () => accept()))
  try {
    await running
  } finally {
    await closed
  }
}

// Syntax preparation never executes the module or changes the measured process deadlines.
export const prepareSubprocessBytecode = async (path: string, signal: AbortSignal) => {
  const env = testStdioEnvironment()
  if (env.NODE_COMPILE_CACHE === undefined) return
  await runPreparationFile(process.execPath, ["--check", path], signal, env)
}
