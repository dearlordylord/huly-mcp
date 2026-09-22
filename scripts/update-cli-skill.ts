import { readFileSync, writeFileSync } from "node:fs"

import { Console, Effect, Schema } from "effect"

import { cliCommandCatalog } from "../packages/huly-cli/src/catalog.js"
import { CLI_FAILURE_CONTRACT } from "../packages/huly-cli/src/failures.js"
import { authCommand, localCommandSkillSurfaces, profileCommand } from "../packages/huly-cli/src/local-commands.js"

const skillPath = "packages/huly-cli/skills/huly-cli/SKILL.md"
const automationPath = "packages/huly-cli/skills/huly-cli/references/automation.md"
const check = process.argv.includes("--check")

const commandPath = (name: keyof typeof cliCommandCatalog): string => `huly ${cliCommandCatalog[name].path.join(" ")}`

interface LocalCommandMetadata {
  readonly description: string | undefined
  readonly name: string
  readonly subcommands: ReadonlyArray<{ readonly commands: ReadonlyArray<LocalCommandMetadata> }>
}

const requireSubcommand = (group: LocalCommandMetadata, expectedGroup: string, names: ReadonlyArray<string>): void => {
  if (group.name !== expectedGroup) {
    throw new Error(`Expected local CLI group '${expectedGroup}'.`)
  }
  const subcommands = group.subcommands.flatMap((entry) => entry.commands)
  const missing = names.filter((name) => !subcommands.some((command) => command.name === name))
  if (missing.length > 0) throw new Error(`Local CLI group '${expectedGroup}' is missing: ${missing.join(", ")}.`)
}

requireSubcommand(authCommand, "auth", ["login", "status", "logout"])
requireSubcommand(profileCommand, "profile", ["create", "list", "select", "update"])

const commandDescription = (group: LocalCommandMetadata, name: string): string => {
  const command = group.subcommands.flatMap((entry) => entry.commands).find((candidate) => candidate.name === name)
  if (command === undefined) throw new Error(`Missing command help for '${name}'.`)
  if (command.description === undefined) throw new Error(`Missing command description for '${name}'.`)
  return command.description
}

const skill = `---
name: huly-cli
description: Operate Huly through the @firfi/huly-cli executable. Use when a coding agent needs to authenticate, switch Huly workspaces or projects, discover commands, query structured Huly data, or perform confirmed Huly mutations from a shell or automation workflow.
---

# Huly CLI

Use the CLI's own help and JSON contracts as the authority. Do not memorize or reproduce its complete command catalog.

## Set up authentication

Install the package with \`pnpm add --global @firfi/huly-cli\`, then run:

\`\`\`bash
huly auth login
huly auth status --json
\`\`\`

Use \`huly profile create|list|select|update\` for named URL, workspace, and default-project contexts. Environment variables take priority over the active profile. Never print, copy into chat, or persist a password; login stores only the returned token in the operating system's user config directory.

Key local command surfaces:

${Object.values(localCommandSkillSurfaces)
  .map((surface) => `\`${surface}\``)
  .join("\n")}

## Discover before acting

1. Run \`huly --help\` to discover groups.
2. Run \`huly <group> --help\` and then leaf \`--help\` to learn exact fields.
3. Add \`--json\` for a lossless machine-readable result.
4. Inspect the target before a mutation.
5. Add \`--yes\` only after checking commands marked as consequential.

Reusable identifiers in human tables are safe to copy, but prefer JSON for automation.

## High-value workflows

List projects and issues:

\`\`\`bash
${commandPath("list_projects")} --json
${commandPath("list_issues")} --project HULY --json
${commandPath("get_issue")} HULY HULY-123 --json
\`\`\`

Search broadly before choosing a specialized command:

\`\`\`bash
${commandPath("fulltext_search")} "release blocker" --json
\`\`\`

For scripts, read [references/automation.md](references/automation.md) before handling failures or retries.
`

const requiredLocalSurface = [
  {
    documentedSurface: localCommandSkillSurfaces.authLogin,
    descriptionSource: commandDescription(authCommand, "login"),
    command: "login",
    description: "store only the resulting token"
  },
  {
    documentedSurface: localCommandSkillSurfaces.authStatus,
    descriptionSource: commandDescription(authCommand, "status"),
    command: "status",
    description: "sanitized authentication"
  },
  {
    documentedSurface: localCommandSkillSurfaces.authLogout,
    descriptionSource: commandDescription(authCommand, "logout"),
    command: "logout",
    description: "Remove the stored token"
  },
  {
    documentedSurface: localCommandSkillSurfaces.profileCreate,
    descriptionSource: commandDescription(profileCommand, "create"),
    command: "create",
    description: "Create a named URL and workspace profile"
  },
  {
    documentedSurface: localCommandSkillSurfaces.profileList,
    descriptionSource: commandDescription(profileCommand, "list"),
    command: "list",
    description: "List named profiles"
  },
  {
    documentedSurface: localCommandSkillSurfaces.profileSelect,
    descriptionSource: commandDescription(profileCommand, "select"),
    command: "select",
    description: "Select the active profile"
  },
  {
    documentedSurface: localCommandSkillSurfaces.profileUpdate,
    descriptionSource: commandDescription(profileCommand, "update"),
    command: "update",
    description: "Update a named profile"
  }
]

for (const surface of requiredLocalSurface) {
  if (!surface.descriptionSource.includes(surface.description)) {
    throw new Error(`Local CLI description drifted for '${surface.command}'.`)
  }
  if (!skill.includes(surface.documentedSurface)) {
    throw new Error(`Generated skill does not document the local '${surface.command}' surface.`)
  }
}

const failureRows = Object.entries(CLI_FAILURE_CONTRACT)
  .map(([kind, entry]) => `| \`${entry.code}\` | ${kind} | ${entry.exitStatus} |`)
  .join("\n")

const automation = `# Structured automation

Keep stdout for successful command results and parse expected failures from stderr.

## Failure document

\`\`\`json
{
  "code": "NOT_FOUND",
  "message": "Issue HULY-404 was not found.",
  "retryable": false,
  "hint": "Optional next action",
  "details": { "tag": "IssueNotFoundError" }
}
\`\`\`

\`hint\` and \`details\` are optional. Secret values are never part of the contract.

| Code | Class | Exit status |
| --- | --- | ---: |
${failureRows}

Exit status 70 distinguishes an internal CLI defect. Retry only when \`retryable\` is true, and never blindly retry a consequential write.

## Shell pattern

\`\`\`bash
result_file="$(mktemp)"
error_file="$(mktemp)"
if ${commandPath("list_issues")} --project HULY --json >"$result_file" 2>"$error_file"; then
  jq '.[] | {identifier, title, status}' "$result_file"
else
  jq '{code, message, retryable, hint}' "$error_file" >&2
fi
\`\`\`

Use temporary files or another mechanism that preserves stdout/stderr separation. Do not merge streams before parsing.
`

const GeneratedFilesSchema = Schema.Struct({ skill: Schema.String, automation: Schema.String })
const generated = Schema.decodeUnknownSync(GeneratedFilesSchema)({ skill, automation })
const current = (): typeof generated => ({
  skill: readFileSync(skillPath, "utf8"),
  automation: readFileSync(automationPath, "utf8")
})

if (check) {
  const existing = current()
  if (existing.skill !== generated.skill || existing.automation !== generated.automation) {
    Effect.runSync(Console.error("Published Huly CLI Agent Skill is stale. Run `pnpm update-cli-skill`."))
    process.exitCode = 1
  } else {
    Effect.runSync(Console.log("Huly CLI Agent Skill matches command and failure contracts."))
  }
} else {
  writeFileSync(skillPath, generated.skill)
  writeFileSync(automationPath, generated.automation)
  Effect.runSync(Console.log("Updated published Huly CLI Agent Skill."))
}
