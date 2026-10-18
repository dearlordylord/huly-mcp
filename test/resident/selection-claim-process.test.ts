import { spawn } from "node:child_process"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { createInterface } from "node:readline"
import { expect, it } from "vitest"

const PROCESS_BOUND = 30_000
const CONTENDERS = 10
const SINGLE_PARENT_BOUND = 5_000
const CLEANUP_BOUND = 2_000

const within = <A>(pending: Promise<A>, signal: AbortSignal) =>
  new Promise<A>((accept, reject) => {
    const abort = () => reject(new Error("Claim process observation exceeded its deadline"))
    signal.addEventListener("abort", abort, { once: true })
    pending.then(
      (value) => {
        signal.removeEventListener("abort", abort)
        accept(value)
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort)
        reject(error)
      }
    )
    if (signal.aborted) abort()
  })

const start = (directory: string) => {
  const child = spawn(process.execPath, [
    "--import",
    "tsx",
    resolve("test/resident/fixtures/selection-claim-child.ts"),
    directory
  ])
  const exited = new Promise<number | null>((accept, reject) => {
    child.once("error", reject)
    child.once("exit", accept)
  })
  const lines = createInterface({ input: child.stdout })
  const reported = new Promise<string>((accept, reject) => {
    lines.once("line", accept)
    lines.once("close", () => reject(new Error("Claim child closed without a report")))
    child.once("error", reject)
  })
  return { child, exited, reported }
}

it(
  "admits one independent owner and refuses takeover of its crash residue",
  async () => {
    const directory = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-claim-process-"))
    const children: Array<ReturnType<typeof start>> = []
    try {
      for (let index = 0; index < CONTENDERS; index++) children.push(start(directory))
      const reports = await Promise.all(children.map((candidate) => candidate.reported))
      expect(reports.filter((report) => report === "claimed")).toHaveLength(1)
      expect(reports.filter((report) => report === "refused")).toHaveLength(CONTENDERS - 1)
      const winner = children.find((_, index) => reports[index] === "claimed")
      if (winner === undefined) throw new Error("Missing claim owner")
      const claimed = await fs.lstat(join(directory, "selection.claim"), { bigint: true })
      expect(winner.child.kill("SIGKILL")).toBe(true)
      expect(await winner.exited).toBe(null)
      expect(winner.child.signalCode).toBe("SIGKILL")
      const late = start(directory)
      children.push(late)
      expect(await late.reported).toBe("refused")
      expect(await late.exited).toBe(0)
      expect(await fs.readdir(directory)).toEqual(["selection.claim"])
      const retained = await fs.lstat(join(directory, "selection.claim"), { bigint: true })
      expect({ dev: retained.dev, ino: retained.ino }).toEqual({ dev: claimed.dev, ino: claimed.ino })
    } finally {
      for (const candidate of children) {
        if (candidate.child.exitCode === null && candidate.child.signalCode === null) candidate.child.kill("SIGKILL")
      }
      await Promise.all(children.map((candidate) => candidate.exited))
      await fs.rm(directory, { recursive: true, force: true })
    }
  },
  PROCESS_BOUND
)

it(
  "releases a claimed launch on cooperative process termination so the next launcher can own it",
  async () => {
    const directory = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-claim-cancel-"))
    const children: Array<ReturnType<typeof start>> = []
    const deadline = AbortSignal.timeout(SINGLE_PARENT_BOUND)
    let primary: { readonly error: unknown } | undefined
    try {
      const original = start(directory)
      children.push(original)
      expect(await within(original.reported, deadline)).toBe("claimed")
      expect(await fs.readdir(directory)).toEqual(["selection.claim"])
      expect(original.child.kill("SIGTERM")).toBe(true)
      expect(await within(original.exited, deadline)).toBe(130)
      expect(original.child.signalCode).toBe(null)
      expect(await fs.readdir(directory)).toEqual([])

      const replacement = start(directory)
      children.push(replacement)
      expect(await within(replacement.reported, deadline)).toBe("claimed")
      expect(await fs.readdir(directory)).toEqual(["selection.claim"])
      expect(replacement.child.kill("SIGTERM")).toBe(true)
      expect(await within(replacement.exited, deadline)).toBe(130)
      expect(replacement.child.signalCode).toBe(null)
      expect(await fs.readdir(directory)).toEqual([])
    } catch (error) {
      primary = { error }
    }
    for (const candidate of children) {
      if (candidate.child.exitCode === null && candidate.child.signalCode === null) candidate.child.kill("SIGKILL")
    }
    const joins = await Promise.allSettled([
      within(Promise.all(children.map((candidate) => candidate.exited)), AbortSignal.timeout(CLEANUP_BOUND))
    ])
    const removals = joins.every((outcome) => outcome.status === "fulfilled")
      ? await Promise.allSettled([fs.rm(directory, { recursive: true, force: true })])
      : []
    if (primary !== undefined) throw primary.error
    for (const outcome of [...joins, ...removals]) {
      if (outcome.status === "rejected") throw outcome.reason
    }
  },
  SINGLE_PARENT_BOUND + CLEANUP_BOUND
)
