import { chmod, mkdtemp, readFile, rm, stat, symlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Schema } from "effect"
import { expect, test } from "vitest"
import {
  retainConcurrencyEvidence,
  RetainedEvidenceSchema
} from "../../scripts/issue-movement-concurrency/retain-evidence.js"
const issue = {
  issueId: "root",
  identifier: "SRC-1",
  title: "Disposable fixture",
  status: "Todo",
  labels: [],
  project: "SRC"
}
const receipt = {
  transport: "mcp",
  case: "preserve-later-ancestry",
  evidence: {
    observation: {
      status: "result",
      result: {
        outcome: "blocked",
        changed: false,
        reason: "Fixture refused before allocation.",
        issueIds: ["root"],
        inspection: "No writes performed."
      }
    },
    gatewayEvents: [{ event: "barrier", point: "commit-after", action: "pause" }],
    mutation: { before: issue, action: { kind: "none" }, after: issue }
  }
}
const withDirectory = async (use: (directory: string) => Promise<void>) => {
  const directory = await mkdtemp(join(tmpdir(), "concurrency-evidence-"))
  await chmod(directory, 0o700)
  try {
    await use(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
test("retains a schema-owned scenario receipt privately and refuses overwrite", async () => {
  await withDirectory(async (directory) => {
    await Effect.runPromise(retainConcurrencyEvidence({ directory, receipt: { ...receipt, private: "SECRET_MARKER" } }))
    const path = join(directory, "concurrency-mcp-preserve-later-ancestry.json")
    const raw = await readFile(path, "utf8")
    expect(Schema.decodeUnknownSync(Schema.fromJsonString(RetainedEvidenceSchema))(raw)).toEqual(receipt)
    expect(raw).not.toContain("SECRET_MARKER")
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    const refused = await Effect.runPromise(retainConcurrencyEvidence({ directory, receipt }).pipe(Effect.flip))
    expect(refused.stage).toBe("write")
    expect(await readFile(path, "utf8")).toBe(raw)
  })
})
test("refuses exposed and symlink directories without writing a receipt", async () => {
  await withDirectory(async (directory) => {
    await chmod(directory, 0o755)
    expect((await Effect.runPromise(retainConcurrencyEvidence({ directory, receipt }).pipe(Effect.flip))).stage).toBe(
      "directory"
    )
    await chmod(directory, 0o700)
    const link = `${directory}-link`
    await symlink(directory, link)
    try {
      expect(
        (await Effect.runPromise(retainConcurrencyEvidence({ directory: link, receipt }).pipe(Effect.flip))).stage
      ).toBe("directory")
    } finally {
      await rm(link)
    }
    await expect(readFile(join(directory, "concurrency-mcp-preserve-later-ancestry.json"))).rejects.toMatchObject({
      code: "ENOENT"
    })
  })
})
test("rejects malformed results and path traversal labels through the schema without exposing input", async () => {
  await withDirectory(async (directory) => {
    for (const invalid of [
      { ...receipt, case: "../SECRET_MARKER" },
      { ...receipt, evidence: { private: "SECRET_MARKER" } }
    ]) {
      const failure = await Effect.runPromise(
        retainConcurrencyEvidence({ directory, receipt: invalid }).pipe(Effect.flip)
      )
      expect(failure.stage).toBe("input")
      expect(JSON.stringify(failure)).not.toContain("SECRET_MARKER")
    }
  })
})
test("scenario persistence precedes stdout and shell domain assertions", async () => {
  const scenario = await readFile("scripts/issue-movement-concurrency/scenario.ts", "utf8")
  const shell = await readFile("scripts/integration_test_issue_movement_concurrency.sh", "utf8")
  const retention = /await\s+Effect\.runPromise\(\s*retainConcurrencyEvidence\(/
  const output = "process.stdout.write(`${JSON.stringify(evidence)}"
  const retained = retention.exec(scenario)
  const printed = scenario.indexOf(output)
  expect(retained).not.toBeNull()
  expect(printed).toBeGreaterThanOrEqual(0)
  if (retained === null || printed < 0) return
  expect(retained.index).toBeGreaterThanOrEqual(0)
  expect(retained.index).toBeLessThan(printed)
  const hasRetentionBeforeOutput = (source: string) => {
    const saved = retention.exec(source)
    const stdout = source.indexOf(output)
    return saved !== null && stdout >= 0 && saved.index < stdout
  }
  expect(hasRetentionBeforeOutput(scenario)).toBe(true)
  const removed = scenario.replace(retention, "removedRetention(")
  expect(hasRetentionBeforeOutput(removed)).toBe(false)
  expect(hasRetentionBeforeOutput(`${removed}\n${retained[0]}`)).toBe(false)
  expect(hasRetentionBeforeOutput(scenario.replace(output, "removedOutput("))).toBe(false)
  expect(shell).toContain('RESULT=$(MOVEMENT_CONCURRENCY_CASE="$NAME"')
})
