import { spawn } from "node:child_process"

import { Schema } from "effect"

import { type CapturedProcessResult, CapturedProcessResultSchema } from "./captured-process-schema.js"

const PROCESS_TIMEOUT_MILLISECONDS = 15_000
const PROCESS_TERMINATION_GRACE_MILLISECONDS = 1_000
const PROCESS_EXIT_SIGNALLED = -1

export const runCapturedProcess = (
  executable: string,
  args: ReadonlyArray<string>,
  env: Readonly<Record<string, string>>,
  stdin = "",
  timeoutMilliseconds = PROCESS_TIMEOUT_MILLISECONDS
): Promise<CapturedProcessResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: process.cwd(), env, stdio: ["pipe", "pipe", "pipe"] })
    const stdout: Array<Buffer> = []
    const stderr: Array<Buffer> = []
    let timedOut = false
    let forceKillTimeout: ReturnType<typeof setTimeout> | undefined
    const timeout = setTimeout(() => {
      timedOut = true
      child.kill("SIGTERM")
      forceKillTimeout = setTimeout(() => child.kill("SIGKILL"), PROCESS_TERMINATION_GRACE_MILLISECONDS)
    }, timeoutMilliseconds)
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk))
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk))
    child.on("error", (error) => {
      clearTimeout(timeout)
      if (forceKillTimeout !== undefined) clearTimeout(forceKillTimeout)
      reject(error)
    })
    child.on("close", (exitCode) => {
      clearTimeout(timeout)
      if (forceKillTimeout !== undefined) clearTimeout(forceKillTimeout)
      if (timedOut) {
        reject(new Error(`Captured process timed out and was terminated: ${args.join(" ")}`))
        return
      }
      resolve(
        Schema.decodeUnknownSync(CapturedProcessResultSchema)({
          exitCode: exitCode ?? PROCESS_EXIT_SIGNALLED,
          stderr: Buffer.concat(stderr).toString("utf8"),
          stdout: Buffer.concat(stdout).toString("utf8")
        })
      )
    })
    child.stdin.end(stdin)
  })
