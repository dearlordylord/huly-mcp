import { spawn, spawnSync } from "node:child_process"
import { clearTimeout, setTimeout } from "node:timers"

import { Clock, Effect, Schema } from "effect"
import { mkdirSync, writeFileSync, renameSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"

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

const CustodySchema = Schema.Struct({
  parentPid: NonNegativeInteger,
  groupPid: Schema.optionalKey(NonNegativeInteger),
  state: Schema.Literals(["starting", "active", "unconfirmed"])
})
const CustodyDirectorySchema = Schema.UndefinedOr(Schema.NonEmptyString)
interface CleanupPorts {
  readonly now: () => number
  readonly pause: (milliseconds: number) => Promise<void>
}
const cleanupPorts: CleanupPorts = {
  now: () => Effect.runSync(Clock.currentTimeMillis),
  pause: (milliseconds) => new Promise((done) => setTimeout(done, milliseconds))
}

interface RunBoundedCommandOptions {
  readonly cleanup?: CleanupPorts
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

const groupStopped = (pid: number): boolean => {
  try {
    process.kill(-pid, 0)
    return false
  } catch (error) {
    if (isErrnoException(error) && error.code === "ESRCH") return true
    throw error
  }
}
const proveStoppedGroup = async (
  child: ReturnType<typeof spawn>,
  cleanup: CleanupPorts,
  grace: Milliseconds,
  stop: () => void,
  name: string
): Promise<void> => {
  if (process.platform === "win32" || child.pid === undefined) return
  const pid = child.pid
  if (groupStopped(pid)) return
  stop()
  const deadline = cleanup.now() + grace + GROUP_POLL_MILLISECONDS
  while (!groupStopped(pid) && cleanup.now() < deadline) await cleanup.pause(GROUP_POLL_MILLISECONDS)
  if (!groupStopped(pid)) throw new Error(`${name} process-group cleanup is unconfirmed`)
}

export const runBoundedCommand = ({
  args,
  cleanup = cleanupPorts,
  executable,
  forwardOutput = true,
  name,
  terminationGraceMilliseconds = defaultTerminationGraceMilliseconds,
  timeoutMilliseconds
}: RunBoundedCommandOptions): Promise<RunBoundedCommandResult> =>
  new Promise<RunBoundedCommandResult>((resolve, reject) => {
    const directory = Schema.decodeUnknownSync(CustodyDirectorySchema)(process.env.MOVEMENT_CUSTODY_DIR)
    const custody = directory === undefined ? undefined : join(directory, `${process.pid}-${randomUUID()}.json`)
    const record = (state: "starting" | "active" | "unconfirmed", groupPid?: number): void => {
      if (custody === undefined || directory === undefined) return
      mkdirSync(directory, { recursive: true })
      const value = Schema.decodeUnknownSync(CustodySchema)({
        parentPid: process.pid,
        state,
        ...(groupPid === undefined ? {} : { groupPid })
      })
      writeFileSync(`${custody}.tmp`, JSON.stringify(value))
      renameSync(`${custody}.tmp`, custody)
    }
    record("starting")
    const child = spawn(executable, args, {
      detached: process.platform !== "win32",
      stdio: ["inherit", "pipe", "pipe"]
    })
    const stdoutLineCounter = { endsWithLineBreak: true, lineBreaks: OutputLineCount.make(0), wasWritten: false }
    const stderrLineCounter = { endsWithLineBreak: true, lineBreaks: OutputLineCount.make(0), wasWritten: false }
    let timedOut = false
    let interrupted: NodeJS.Signals | undefined
    let escalationTimer: NodeJS.Timeout | undefined
    let settlementTimer: NodeJS.Timeout | undefined
    let registrationFailure: unknown
    let cleanupUnconfirmed = false

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
      escalationTimer ??= setTimeout(() => {
        try {
          terminate(child, "SIGKILL")
          settlementTimer = setTimeout(() => {
            retainUnconfirmed()
            clearTimeout(timer)
            child.stdout.destroy()
            child.stderr.destroy()
            reject(new Error(`${name} process-group cleanup is unconfirmed`))
          }, GROUP_POLL_MILLISECONDS)
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
    const retainUnconfirmed = (): void => {
      cleanupUnconfirmed = true
      try {
        terminate(child, "SIGKILL")
      } catch {
        /* Custody remains unconfirmed. */
      }
      try {
        record("unconfirmed", child.pid)
      } catch {
        /* Retain the original custody record if persistence fails. */
      }
      removeHandlers()
      clearTimeout(escalationTimer)
      clearTimeout(settlementTimer)
    }
    const checkRegistration = (): void => {
      if (cleanupUnconfirmed) throw new Error(`${name} process-group cleanup is unconfirmed`)
      if (registrationFailure !== undefined) throw registrationFailure
    }
    child.once("close", async (code, signal) => {
      clearTimeout(timer)
      clearTimeout(settlementTimer)
      try {
        await proveStoppedGroup(child, cleanup, terminationGraceMilliseconds, stop, name)
        checkRegistration()
        clearTimeout(settlementTimer)
        if (custody !== undefined) unlinkSync(custody)
      } catch (error) {
        retainUnconfirmed()
        reject(error)
        return
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
    try {
      record("active", child.pid)
    } catch (error) {
      registrationFailure = error
      stop()
    }
  })
