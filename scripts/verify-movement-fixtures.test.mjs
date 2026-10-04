import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import { inspectMovementFixture, verifyMovementFixtures } from "./verify-movement-fixtures.mjs"

const jqCompileFailureExit = 3
const missingAdapterAndDiscoveryFailures = 2

for (const flag of ["--arg", "--argjson"]) {
  test(`rejects reserved jq label with ${flag}`, (t) => {
    const directory = mkdtempSync(join(tmpdir(), "movement-fixture-"))
    t.after(() => rmSync(directory, { recursive: true }))
    writeFileSync(join(directory, "bad.sh"), `value=$(jq -nc \\\n ${flag} label '1' '{value:$label}')\n`)
    assert.equal(verifyMovementFixtures(["bad.sh"], directory).length, 1)
    const jq = spawnSync("jq", ["-nc", flag, "label", "1", "{value:$label}"], { encoding: "utf8" })
    assert.equal(jq.status, jqCompileFailureExit)
  })
}

test("accepts valid jq and harmless Bash display labels", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "movement-fixture-"))
  t.after(() => rmSync(directory, { recursive: true }))
  writeFileSync(join(directory, "good.sh"), `echo 'display --arg label'\nvalue=$(jq -nc --arg itemLabel 'ok' '{value:$itemLabel}')\n`)
  assert.deepEqual(verifyMovementFixtures(["good.sh"], directory), [])
  const jq = spawnSync("jq", ["-nc", "--arg", "itemLabel", "ok", "{value:$itemLabel}"], { encoding: "utf8" })
  assert.equal(jq.status, 0)
  assert.equal(jq.stdout.trim(), '{"value":"ok"}')
  assert.deepEqual(inspectMovementFixture("echo 'jq --arg label display'", "display.sh"), [])
})

test("rejects actual Bash syntax errors", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "movement-fixture-"))
  t.after(() => rmSync(directory, { recursive: true }))
  writeFileSync(join(directory, "syntax.sh"), "if then\n")
  assert.deepEqual(verifyMovementFixtures(["syntax.sh"], directory), ["syntax.sh: Bash syntax check failed."])
})

const treeSource = readFileSync(new URL("./integration_test_issue_tree.sh", import.meta.url), "utf8")
const treeHelpers = treeSource.slice(treeSource.indexOf("tree_mcp_reply() {"), treeSource.indexOf("\nmcp() {"))
assert.ok(treeHelpers.includes("tree_mcp_reply() {"))
const treeHelperTimeoutMs = 5000
const secretMarker = "PRIVATE_PAYLOAD_MUST_NOT_BE_LOGGED"
const envelope = (text, result = {}) => JSON.stringify({ jsonrpc: "2.0", id: 2, result: { content: [{ type: "text", text }], ...result } })
const runReply = (response) => spawnSync("bash", ["-c", `${treeHelpers}\nvalue=$(tree_mcp_reply move_issue "$1") || exit $?\nprintf '%s' "$value"`, "fixture-test", response], { encoding: "utf8", timeout: treeHelperTimeoutMs })

for (const [name, response, expected] of [
  ["object", envelope('{"outcome":"blocked"}'), '{"outcome":"blocked"}'],
  ["false", envelope("false"), "false"]
]) {
  test(`tree MCP reply preserves valid ${name} JSON`, () => {
    const result = runReply(response)
    assert.equal(result.status, 0)
    assert.equal(result.stdout, expected)
  })
}

for (const [name, response] of [
  ["empty", ""],
  ["malformed envelope", secretMarker],
  ["multiple envelopes", `${envelope("{}")}\n${envelope("{}")}`],
  ["RPC error", JSON.stringify({ jsonrpc: "2.0", id: 2, error: { message: secretMarker } })],
  ["tool error", envelope(secretMarker, { isError: true })],
  ["non-JSON text", envelope(secretMarker)],
  ["multiple JSON values", envelope("{} {}")],
  ["multiple content blocks", envelope("{}", { content: [{ type: "text", text: "{}" }, { type: "text", text: secretMarker }] })],
  ["content object", envelope("{}", { content: { text: secretMarker } })],
  ["missing block type", envelope("{}", { content: [{ text: secretMarker }] })],
  ["non-text block", envelope("{}", { content: [{ type: "image", text: secretMarker }] })],
  ["empty content", envelope("{}", { content: [] })],
  ["empty text", envelope("")],
  ["nonboolean isError", envelope("{}", { isError: secretMarker })]
]) {
  test(`tree MCP reply fails closed for ${name} inside command substitution`, () => {
    const result = runReply(response)
    assert.equal(result.status, 1)
    assert.equal(result.stdout, "")
    assert.match(result.stderr, /FAIL: tree MCP tool=move_issue phase=/)
    assert.ok(!result.stderr.includes(secretMarker))
  })
}

for (const legacy of ['protocolVersion:"2024-11-05"', 'MCP_AUTO_EXIT=true', 'method:"initialize"']) {
  test("rejects legacy fixture MCP transport", () => {
    assert.equal(inspectMovementFixture(legacy, "legacy.sh").length, 1)
  })
}

test("movement fixtures require the common call and discovery adapters", () => {
  const failures = inspectMovementFixture("mcp() { node dist/index.cjs; }", "scripts/integration_test_issue_movement.sh")
  assert.equal(failures.length, missingAdapterAndDiscoveryFailures)
})
