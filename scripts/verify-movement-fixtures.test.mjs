import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

import { inspectMovementFixture, verifyMovementFixtures } from "./verify-movement-fixtures.mjs"

for (const flag of ["--arg", "--argjson"]) {
  test(`rejects reserved jq label with ${flag}`, (t) => {
    const directory = mkdtempSync(join(tmpdir(), "movement-fixture-"))
    t.after(() => rmSync(directory, { recursive: true }))
    writeFileSync(join(directory, "bad.sh"), `value=$(jq -nc \\\n ${flag} label '1' '{value:$label}')\n`)
    assert.equal(verifyMovementFixtures(["bad.sh"], directory).length, 1)
    const jq = spawnSync("jq", ["-nc", flag, "label", "1", "{value:$label}"], { encoding: "utf8" })
    assert.equal(jq.status, 3)
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
