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
  return commands.flatMap((line) => {
    const command = line.match(/(?:^|\$\(|\||;)\s*jq\s+(.+)/)?.[1]
    return command && /--arg(?:json)?\s+(?:label\b|"label"|'label')/.test(command)
      ? [`${filePath}: jq argument name label is reserved; use a descriptive alternative.`]
      : []
  })
}

export function verifyMovementFixtures(files = MOVEMENT_FIXTURES, cwd = process.cwd()) {
  return files.flatMap((filePath) => {
    const path = resolve(cwd, filePath)
    const source = readFileSync(path, "utf8")
    const syntax = spawnSync("bash", ["-n", path], { encoding: "utf8" })
    const failures = inspectMovementFixture(source, filePath)
    if (syntax.error || syntax.status !== 0) failures.push(`${filePath}: Bash syntax check failed.`)
    return failures
  })
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
