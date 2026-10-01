# Shared local profile verification (#292)

Date: 2026-10-01. Verification uses the Linux-local dependencies in
`/tmp/hulymcp-effect-stable`, with local Docker Huly reached through
`host.docker.internal:8087`. The canonical checkout's shared dependencies were
not reinstalled.

Versions: Node.js 24.20.0; pnpm 10.29.3; Effect, @effect/platform-node and
@effect/vitest 4.0.0; @effect/tsgo 0.36.4; Vitest 5.0.1;
@hcengineering/api-client 0.7.19; @hcengineering/core 0.7.26.

## Evidence

| Requirement | Evidence |
| --- | --- |
| CLI flag/environment/active precedence; explicit-only stdio | `test/cli/profile-store.test.ts`; packed CLI and stdio live workflow |
| Same saved credential supports both entrypoints | Real packed CLI password login, environment credentials removed, matching live project identifiers from CLI and stdio |
| Destination binding and complete environment override | Resolver tests cover URL/workspace overrides, metadata edits, default-project-only edits, unbound legacy credentials and ephemeral token/password configuration; live CLI and stdio reject changed workspace |
| Prompt-free missing credentials; secret-free diagnostics | Live stdio fails after logout; harness inspects login output, persisted files and operation/error output for secrets |
| Shared credential-store seam | Both resolvers and save/logout operations use `CredentialStoreSelector`; injected selector test retrieves the same credential through CLI and stdio without a credential file |
| Existing configuration and file behavior | Existing CLI/config/HTTP/unit suites remain in `pnpm check-all`; file paths, permissions, atomic replacement, password login and token/password config adapters remain tested |
| Schema boundaries, typed errors, redaction and explicit effects | Shared model/environment/file codecs; typed store errors; injected storage ports; schema/type/Effect/complexity/lint/cycle gates |
| Operator workflow | Root and CLI README, generated CLI skill, and `INTEGRATION_TESTING.md` |

`pnpm check-all` passed: 339 test files, 4,758 tests; statements 99.48%,
branches 99.01%, functions 99.04%, lines 99.57%. Shared profile modules have
100% branch coverage. No coverage exclusions or threshold changes were added.

The focused live command passed:

```bash
set -a
source .env.local
set +a
HULY_URL="${HULY_URL/localhost/host.docker.internal}" pnpm integration:profiles
```

It packs/installs the CLI, answers the real login prompts, reads through both
entrypoints without environment credentials, compares returned project
identifiers, changes CLI active selection, checks destination-change rejection,
logs out, and checks prompt-free missing credentials. It verifies that the
password is neither echoed nor persisted, that ordinary profile metadata
contains no token, and that operation/error output contains no saved token.

The full live suite command is:

```bash
HULY_URL="${HULY_URL/localhost/host.docker.internal}" bash scripts/integration_test_full.sh
```

Full-suite result: **1,441 passed, 0 failed, 31 skipped (of 1,472)**, exit 0.
The skips are the harness’s declared cases for unavailable/unsupported local
facilities or operations deliberately excluded to avoid workspace pollution.
They do not replace any shared-profile acceptance check; the focused profile
workflow passed separately.

Implementation commit: `66a726e5` (shared destination-bound profiles).

## Scope limits

The saved credential is the workspace token returned by existing password
login; this workflow does not create or certify a managed API token. Legacy
unbound tokens remain readable and removable but require login before use;
there is no automatic migration. Optional native storage and the refined token
import/status/logout workflow are separate issues (#293/#302 and #301).
