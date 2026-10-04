import { spawn, spawnSync } from "node:child_process"
import { clearTimeout, setTimeout } from "node:timers"

import { Schema } from "effect"

import { NonNegativeInteger } from "../src/domain/schemas/shared.js"
import { OutputLineCount } from "./quality-output-budget.js"

export const Milliseconds = NonNegativeInteger.pipe(Schema.brand("QualityGateMilliseconds")).annotate({
  identifier: "QualityGateMilliseconds",
  description: "Duration in milliseconds used to bound a quality-gate process."
})
export type Milliseconds = Schema.Schema.Type<typeof Milliseconds>

const DEFAULT_TERMINATION_GRACE_MILLISECONDS_VALUE = 5_000
const defaultTerminationGraceMilliseconds = Milliseconds.make(DEFAULT_TERMINATION_GRACE_MILLISECONDS_VALUE)
const LAST_BYTE_OFFSET = -1
const LINE_FEED_BYTE = 10
const MILLISECONDS_PER_SECOND = 1_000
const GROUP_POLL_MILLISECONDS = 20

interface LineCounter {
  endsWithLineBreak: boolean
  lineBreaks: OutputLineCount
  wasWritten: boolean
}

interface RunBoundedCommandOptions {
  readonly args: ReadonlyArray<string>
  readonly executable: string
  readonly forwardOutput?: boolean
  readonly name: string
  readonly terminationGraceMilliseconds?: Milliseconds
  readonly timeoutMilliseconds: Milliseconds
}

interface RunBoundedCommandResult {
  readonly outputLineCount: OutputLineCount
}

/* v8 ignore next -- This guard is reached only when POSIX process-group termination races with exit. */
const isErrnoException = (error: unknown): error is NodeJS.ErrnoException => error instanceof Error && "code" in error

const terminate = (child: ReturnType<typeof spawn>, signal: NodeJS.Signals): void => {
  /* v8 ignore next -- A successfully spawned child has a PID; immediate spawn errors use the error event. */
  if (child.pid === undefined) return

  /* v8 ignore start -- Windows process-tree termination is exercised on Windows CI. */
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" })
    return
  }
  /* v8 ignore stop */

  try {
    process.kill(-child.pid, signal)
  } catch (error) {
    /* v8 ignore start -- POSIX process-group exit race and unexpected kill defects. */
    if (!isErrnoException(error) || error.code !== "ESRCH") throw error
    /* v8 ignore stop */
  }
}

export const runBoundedCommand = ({
  args,
  executable,
  forwardOutput = true,
  name,
  terminationGraceMilliseconds = defaultTerminationGraceMilliseconds,
  timeoutMilliseconds
}: RunBoundedCommandOptions): Promise<RunBoundedCommandResult> =>
  new Promise<RunBoundedCommandResult>((resolve, reject) => {
    const child = spawn(executable, args, {
      detached: process.platform !== "win32",
      stdio: ["inherit", "pipe", "pipe"]
    })
    const stdoutLineCounter = { endsWithLineBreak: true, lineBreaks: OutputLineCount.make(0), wasWritten: false }
    const stderrLineCounter = { endsWithLineBreak: true, lineBreaks: OutputLineCount.make(0), wasWritten: false }
    let timedOut = false
    let interrupted: NodeJS.Signals | undefined
    let escalationTimer: NodeJS.Timeout | undefined

    const observeOutput = (output: Buffer, destination: NodeJS.WriteStream, lineCounter: LineCounter): void => {
      lineCounter.wasWritten = true
      lineCounter.endsWithLineBreak = output.at(LAST_BYTE_OFFSET) === LINE_FEED_BYTE
      for (const byte of output) {
        if (byte === LINE_FEED_BYTE) {
          lineCounter.lineBreaks = OutputLineCount.make(lineCounter.lineBreaks + 1)
        }
      }
      if (forwardOutput) destination.write(output)
    }

    child.stdout.on("data", (output) => {
      observeOutput(output, process.stdout, stdoutLineCounter)
    })
    child.stderr.on("data", (output) => {
      observeOutput(output, process.stderr, stderrLineCounter)
    })

    const stop = (): void => {
      try {
        terminate(child, "SIGTERM")
      } catch (error) {
        /* v8 ignore start -- Unexpected process-control defects are forwarded unchanged. */
        reject(error)
        return
        /* v8 ignore stop */
      }
      /* v8 ignore start -- Windows taskkill is synchronous and cannot use POSIX escalation. */
      if (process.platform === "win32") {
        reject(new Error(`${name} exceeded ${timeoutMilliseconds / MILLISECONDS_PER_SECOND} seconds`))
        return
      }
      /* v8 ignore stop */
      escalationTimer = setTimeout(() => {
        try {
          terminate(child, "SIGKILL")
        } catch (error) {
          /* v8 ignore start -- Unexpected escalation defects are forwarded unchanged. */
          reject(error)
          /* v8 ignore stop */
        }
      }, terminationGraceMilliseconds)
    }
    const onTerm = (): void => {
      interrupted = "SIGTERM"
      stop()
    }
    const onInt = (): void => {
      interrupted = "SIGINT"
      stop()
    }
    process.once("SIGTERM", onTerm)
    process.once("SIGINT", onInt)
    const removeHandlers = (): void => {
      process.removeListener("SIGTERM", onTerm)
      process.removeListener("SIGINT", onInt)
    }
    const timer = setTimeout(() => {
      timedOut = true
      stop()
    }, timeoutMilliseconds)

    child.once("error", (error) => {
      clearTimeout(timer)
      removeHandlers()
      if (!timedOut) {
        clearTimeout(escalationTimer)
        reject(error)
      }
    })
    child.once("close", async (code, signal) => {
      clearTimeout(timer)

      if ((timedOut || interrupted !== undefined) && process.platform !== "win32" && child.pid !== undefined) {
        const pid = child.pid
        const groupStopped = (): boolean => {
          try {
            process.kill(-pid, 0)
            return false
          } catch (error) {
            if (isErrnoException(error) && error.code === "ESRCH") return true
            throw error
          }
        }
        while (!groupStopped()) await new Promise<void>((done) => setTimeout(done, GROUP_POLL_MILLISECONDS))
      }
      removeHandlers()
      clearTimeout(escalationTimer)
      if (timedOut || interrupted !== undefined) {
        reject(
          new Error(
            interrupted === undefined
              ? `${name} exceeded ${timeoutMilliseconds / MILLISECONDS_PER_SECOND} seconds`
              : `${name} interrupted by ${interrupted}`
          )
        )
        return
      }
      if (code !== 0) {
        reject(new Error(`${name} failed with ${signal ?? `exit ${code}`}`))
      } else {
        const outputLineCount = OutputLineCount.make(
          [stdoutLineCounter, stderrLineCounter].reduce(
            (total, lineCounter) =>
              total + lineCounter.lineBreaks + (lineCounter.wasWritten && !lineCounter.endsWithLineBreak ? 1 : 0),
            0
          )
        )
        resolve({ outputLineCount })
      }
    })
  })
