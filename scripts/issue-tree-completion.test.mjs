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
for (const [status, consistency, reason, category] of [
  ["observed", "inconsistent", "Protected payload of SECRET_MARKER differs from approved final values.", "protected-task-payload"],
  ["unavailable", null, "Complete post-write project inventory is unavailable.", "project-inventory-unavailable"],
  ["observed", "undetermined", "Movement deadline interrupted remaining verification reads.", "verification-deadline-interrupted"],
  ["observed", "undetermined", "SECRET_MARKER arbitrary unknown cause", "unclassified"]
]) {
  test(`records safe verification category ${category}`, () => {
    const result = run(JSON.stringify({ outcome: "incomplete", reason: "SECRET_MARKER", tasks: [], execution: { phase: "verification", commit: "acknowledged", reservations: [{ status: "confirmed", issueId: "SECRET_MARKER", number: 1 }, { status: "uncertain", issueId: "SECRET_MARKER" }] }, verification: status === "unavailable" ? { status, reason } : { status, consistency, completeness: "incomplete", reason, tasks: [{ issueId: "SECRET_MARKER" }], records: [{ recordId: "SECRET_MARKER" }], absentIssueIds: [] } }))
    assert.equal(result.status, 1)
    const summary = JSON.parse(result.stderr)
    assert.equal(summary.commitConfirmation, "acknowledged")
    assert.equal(summary.verificationStatus, status)
    assert.equal(summary.verificationConsistency, consistency)
    assert.equal(summary.verificationCompleteness, status === "unavailable" ? null : "incomplete")
    assert.equal(summary.observedTaskCount, status === "unavailable" ? null : 1)
    assert.equal(summary.observedRecordCount, status === "unavailable" ? null : 1)
    assert.equal(summary.confirmedAbsentTaskCount, status === "unavailable" ? null : 0)
    assert.equal(summary.confirmedReservationCount, 1)
    assert.equal(summary.uncertainReservationCount, 1)
    assert.equal(summary.verificationReasonCategory, category)
    assert.equal(summary.reasonCategory, "unclassified")
    assert.ok(!result.stderr.includes("SECRET_MARKER"))
  })
}
test("unrecognized enum values cannot leak through the summary", () => {
  const result = run(JSON.stringify({ outcome: "SECRET_MARKER", execution: { commit: "SECRET_MARKER", phase: "SECRET_MARKER" }, verification: { status: "SECRET_MARKER", consistency: "SECRET_MARKER", completeness: "SECRET_MARKER" } }))
  assert.equal(result.status, 1)
  const summary = JSON.parse(result.stderr)
  assert.equal(summary.outcome, "invalid")
  assert.equal(summary.commitConfirmation, null)
  assert.equal(summary.verificationStatus, null)
  assert.ok(!result.stderr.includes("SECRET_MARKER"))
})
