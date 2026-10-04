import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const source = readFileSync(new URL("./integration_test_issue_tree.sh", import.meta.url), "utf8")
const helper = source.slice(source.indexOf("assert_tree_completion() {"), source.indexOf("assert_document_unchanged() {"))
const run = (result) => spawnSync("bash", ["-c", `${helper}\nassert_tree_completion "$1" '.outcome=="completed" and (.tasks|length)==4'`, "fixture-test", result], { encoding: "utf8", timeout: 5000, killSignal: "SIGKILL" })
test("completion assertion retains passing four-task predicate", () => {
  const result = run(JSON.stringify({ outcome: "completed", tasks: [{}, {}, {}, {}] }))
  assert.equal(result.status, 0)
  assert.equal(result.stderr, "")
})
test("failure records safe outcome and count without payload or identifiers", () => {
  const result = run(JSON.stringify({ outcome: "indeterminate", reason: "SECRET_MARKER", issueId: "SECRET_MARKER", tasks: [], execution: { phase: "verification", reservations: [{ issueId: "SECRET_MARKER" }] } }))
  assert.equal(result.status, 1)
  const summary = JSON.parse(result.stderr)
  assert.equal(summary.outcome, "indeterminate")
  assert.equal(summary.taskCount, 0)
  assert.equal(summary.executionPhase, "verification")
  assert.equal(summary.reservationCount, 1)
  assert.ok(!result.stderr.includes("SECRET_MARKER"))
})
test("malformed result fails with fixed diagnostic only", () => {
  const result = run("SECRET_MARKER")
  assert.equal(result.status, 1)
  assert.equal(result.stderr.trim(), "FAIL: tree completion result is not JSON")
})
