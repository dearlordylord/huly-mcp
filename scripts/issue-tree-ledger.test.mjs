import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, statSync, chmodSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

const snapshot = (overrides = {}) => ({ stage: "acknowledged", tool: "add_comment", unresolvedCreation: true,
  issueIds: ["owner"], projectIds: ["project"], componentIds: [], milestoneIds: [], documentIds: [],
  teamspaceIds: [], referenceIds: [], records: [{ kind: "comment", id: "comment", ownerId: "owner" }],
  tagIdsUnreturned: false, referencePartialIdsUnobservable: false, ...overrides })
const run = (directory, value) => spawnSync(process.execPath,
  ["scripts/run-bundled.mjs", "scripts/integration-issue-tree-ledger.ts", JSON.stringify({ directory, snapshot: value })],
  { encoding: "utf8", timeout: 15000, killSignal: "SIGKILL" })
const fixture = (check) => {
  const directory = mkdtempSync(join(tmpdir(), "tree-ledger-"))
  chmodSync(directory, 0o700)
  try { check(directory) } finally { rmSync(directory, { recursive: true, force: true }) }
}
test("actual bundled ledger entry atomically retains private acknowledged IDs and unknown limitations", () => fixture((directory) => {
  assert.equal(run(directory, snapshot({ tagIdsUnreturned: true })).status, 0)
  assert.equal(run(directory, snapshot({ issueIds: [], projectIds: [], records: [], referencePartialIdsUnobservable: true })).status, 0)
  const path = join(directory, "tree-ledger.json")
  const value = JSON.parse(readFileSync(path, "utf8"))
  assert.deepEqual(value.issueIds, ["owner"])
  assert.deepEqual(value.projectIds, ["project"])
  assert.equal(value.records.length, 1)
  assert.equal(value.tagIdsUnreturned, true)
  assert.equal(value.referencePartialIdsUnobservable, true)
  assert.equal(statSync(path).mode & 0o777, 0o600)
  assert.equal(run(directory, value).status, 0)
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), value)
}))
test("conflicting acknowledged ownership fails without replacing durable evidence", () => fixture((directory) => {
  assert.equal(run(directory, snapshot()).status, 0)
  const path = join(directory, "tree-ledger.json")
  const before = readFileSync(path, "utf8")
  const result = run(directory, snapshot({ records: [{ kind: "comment", id: "comment", ownerId: "other" }] }))
  assert.equal(result.status, 1)
  assert.equal(result.stderr.trim(), "Private tree ledger unavailable")
  assert.equal(readFileSync(path, "utf8"), before)
}))
test("unknown nested owner and malformed boundary IDs are rejected", () => fixture((directory) => {
  assert.equal(run(directory, snapshot({ records: [{ kind: "attachment", id: "blob", ownerId: "unknown" }] })).status, 1)
  assert.equal(run(directory, snapshot({ projectIds: [null] })).status, 1)
}))
test("non-private evidence directory is rejected before creating ledger", () => fixture((directory) => {
  chmodSync(directory, 0o755)
  assert.equal(run(directory, snapshot()).status, 1)
  assert.throws(() => readFileSync(join(directory, "tree-ledger.json")))
}))
