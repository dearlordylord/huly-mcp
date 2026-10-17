import { spawn } from "node:child_process"
import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { createInterface } from "node:readline"
import { expect, it } from "vitest"

const PROCESS_BOUND = 30_000
const CONTENDERS = 10

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
      winner.child.kill("SIGKILL")
      await winner.exited
      const late = start(directory)
      children.push(late)
      expect(await late.reported).toBe("refused")
      expect(await late.exited).toBe(0)
      expect(await fs.readdir(directory)).toEqual(["selection.claim"])
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
