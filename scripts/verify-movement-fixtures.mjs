import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const MOVEMENT_FIXTURES = [
  "scripts/integration_test_issue_tree.sh",
  "scripts/integration_test_issue_transfer.sh",
  "scripts/integration_test_issue_movement_concurrency.sh",
  "scripts/integration_test_issue_attributes.sh",
  "scripts/integration_test_issue_movement.sh"
]

// This recognizes explicit jq command starts, not arbitrary shell syntax or display text.
export function inspectMovementFixture(source, filePath) {
  const commands = source.replace(/\\\r?\n/g, " ").split(/\r?\n/)
  const failures = commands.flatMap((line) => {
    const command = line.match(/(?:^|\$\(|\||;)\s*jq\s+(.+)/)?.[1]
    return command && /--arg(?:json)?\s+(?:label\b|"label"|'label')/.test(command)
      ? [`${filePath}: jq argument name label is reserved; use a descriptive alternative.`]
      : []
  })
  if (/2024-11-05|MCP_AUTO_EXIT|method:\s*["']initialize["']/.test(source))
    failures.push(`${filePath}: legacy MCP transport is forbidden; use the native SDK adapter.`)
  if (MOVEMENT_FIXTURES.includes(filePath) && !filePath.endsWith("issue_tree.sh") &&
      (!source.includes("integration-mcp-adapter.sh") || !source.includes("movement_mcp_call")))
    failures.push(`${filePath}: movement fixture must use the shared native SDK adapter.`)
  if (filePath.endsWith("issue_movement.sh") && !source.includes("movement_mcp_list_tools"))
    failures.push(`${filePath}: discovery must use the native SDK list adapter.`)
  return failures
}

export function verifyMovementFixtures(files = MOVEMENT_FIXTURES, cwd = process.cwd()) {
  const failures = files.flatMap((filePath) => {
    const path = resolve(cwd, filePath)
    const source = readFileSync(path, "utf8")
    const syntax = spawnSync("bash", ["-n", path], { encoding: "utf8" })
    const failures = inspectMovementFixture(source, filePath)
    if (syntax.error || syntax.status !== 0) failures.push(`${filePath}: Bash syntax check failed.`)
    return failures
  })
  if (files.includes("scripts/integration_test_issue_movement_concurrency.sh")) {
    const scenarioPath = "scripts/issue-movement-concurrency/scenario.ts"
    failures.push(...inspectMovementFixture(readFileSync(resolve(cwd, scenarioPath), "utf8"), scenarioPath))
  }
  return failures
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = verifyMovementFixtures()
  if (failures.length > 0) {
    process.stderr.write(`${failures.join("\n")}\n`)
    process.exitCode = 1
  } else {
    process.stdout.write(`Verified ${MOVEMENT_FIXTURES.length} movement fixture scripts.\n`)
  }
}
