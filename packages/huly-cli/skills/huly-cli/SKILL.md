---
name: huly-cli
description: Operate Huly through the @firfi/huly-cli executable. Use when a coding agent needs to authenticate, switch Huly workspaces or projects, discover commands, query structured Huly data, or perform confirmed Huly mutations from a shell or automation workflow.
---

# Huly CLI

Use the CLI's own help and JSON contracts as the authority. Do not memorize or reproduce its complete command catalog.

## Set up authentication

Install the package with `pnpm add --global @firfi/huly-cli`, then run:

```bash
huly auth login
huly auth status --json
```

Use `huly profile create|list|select|update` for named URL, workspace, and default-project contexts. CLI selection uses `--profile`, then `HULY_PROFILE`, then the active profile. Stdio requires explicit `HULY_PROFILE` and never follows the active CLI selection. Saved tokens are bound to their exact URL/workspace: destination edits require login again. Complete environment destination and credentials may override them without being persisted; partial overrides fail. Never print, copy into chat, or persist a password; login stores only the returned token in the operating system's user config directory.

Key local command surfaces:

`huly auth login [--profile <name>] [--json]`
`huly auth status [--profile <name>] [--json]`
`huly auth logout [--profile <name>] [--json]`
`huly profile create <name> --url <url> --workspace <workspace> [--default-project <project>] [--json]`
`huly profile list [--json]`
`huly profile select <name> [--json]`
`huly profile update <name> [--url <url>] [--workspace <workspace>] [--default-project <project> | --clear-default-project] [--json]`

## Discover before acting

1. Run `huly --help` to discover groups.
2. Run `huly <group> --help` and then leaf `--help` to learn exact fields.
3. Add `--json` for a lossless machine-readable result.
4. Inspect the target before a mutation.
5. Add `--yes` only after checking commands marked as consequential.

Reusable identifiers in human tables are safe to copy, but prefer JSON for automation.

## High-value workflows

List projects and issues:

```bash
huly projects list --json
huly issues list --project HULY --json
huly issues get HULY HULY-123 --json
```

Search broadly before choosing a specialized command:

```bash
huly search "release blocker" --json
```

For scripts, read [references/automation.md](references/automation.md) before handling failures or retries.
