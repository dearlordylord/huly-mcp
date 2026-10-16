# macOS PR #318 retest — 2026-10-15

**The reported locked-keychain logout blocker is fixed on this Mac. Full `pnpm check-all` passes. Actual Codex happy-path access passes on the final fresh connection; two earlier handshake timeouts remain recorded and unexplained. Full #293 desktop qualification is still incomplete.**

Candidate: [PR #318](https://github.com/dearlordylord/huly-mcp/pull/318), `5321afc3942e9e373168d5bd7910ae8457517cfd`. PR HEAD rechecked at completion and unchanged. No implementation edits.

macOS 27.0 / 26A428 arm64, Node v25.6.1 `/opt/homebrew/bin/node`, pnpm 10.29.3. Codex app-server 0.163.0, CLI 0.162.1; same OS account/session as previous report. Separate checkout `/private/tmp/hulymcp-macos-pr318`, independent Darwin dependencies, packed CLI 0.51.1 and MCP 0.53.1 installed at `/tmp/hulymcp-pr318-installed`. Existing local Huly integration account/workspace; disposable profile `macos-pr318`. Telemetry disabled. No passwords or token values emitted in evidence.

## Completed checks

| Check | Result |
| --- | --- |
| Build and real native credential CRUD | PASS |
| Packed CLI hidden-password login with explicit OS storage | PASS |
| Offline configured/unverified status; explicit verified Huly check | PASS |
| Hidden token replacement; invalid replacement preserves previous access and files | PASS |
| Native application JSON contains neither test token nor password | PASS |
| Packed CLI project read | PASS, 8 projects |
| Changed default Keychain, original credential retained in search list | PASS |
| Locked Keychain CLI read | PASS: actionable Keychain failure; files unchanged |
| Locked Keychain CLI logout | PASS: exit 1; profile and credential files byte-identical |
| Explicit unlock recovery | PASS: same stored credential remains, verified live Huly access restored |
| Complete environment-backed and file-backed live reads while native keychain locked | PASS |
| Fresh actual Codex startup during locked scenario | Refused startup; host exposed generic handshake-close error, not actionable Keychain guidance. Not a full prompt/denial qualification. |
| Direct packaged stdio MCP project read | PASS, same 8 project identifiers as CLI |
| Final actual Codex app-server project read and direct tool call in this conversation | PASS, same 8 project identifiers as CLI |
| Normal unlocked logout | PASS: native entry absent; profile/selection retained; new CLI read requires credentials without terminal prompt |
| Plain `pnpm check-all` with ordinary host TMPDIR | PASS: 420 files, 5461 tests |

Coverage: statements 99.47%, branches 99.00%, functions 99.04%, lines 99.57%. Full gate includes build, TypeScript and Effect diagnostics, architectural checks, lint/duplication, and coverage. No threshold, timeout, inventory or diagnostic changes were made. The previous macOS test-path and process-group failures no longer reproduce.

## Locked-logout reproduction

The same live packed-CLI harness used for the prior report was adapted to the new package paths and a fresh profile, with strict assertions for the corrected behavior. It creates an unlocked disposable keychain, saves the selected credential there via real hidden token import, restores the original default, and **explicitly re-establishes the search list containing both keychains**. It locks only the disposable keychain, then checks offline status, project read and logout. Both failing operations return `INTEGRATION_FAILED` with instructions to unlock the credential's Keychain and inspect the current session/search list. Both application files remain byte-identical. Unlock restores verified access. Cleanup moves the test credential back through the real application, restores the original search list/default and removes the disposable keychain. This complete regression cycle passed; a second cycle also passed its locked read/logout and fallback-read assertions before interruption of the additional locked-import test.

## Limits and retained failures

- First two fresh Codex connections timed out at the host's 30-second handshake budget. The final connection, after the gate and keychain experiments finished, succeeded, as did a direct `mcp__huly_pr318_final__list_projects` call. Their cause is not established; no claim that the final success explains or fixes the earlier failures.
- The first throwaway direct-stdio attempt closed stdin immediately and exited without responses; it was not accepted as a valid probe. Keeping stdin open and correlating replies produced successful discovery and project read.
- Additional import into a locked **default** disposable keychain triggered an OS unlock dialog. The user did not know the fixture's randomly generated password. The scenario was interrupted, its `finally` cleanup completed, and no further unlock-dialog checks were attempted. It is **NOT RUN to completion**, not PASS or a demonstrated application failure.
- Full visual prompt/denial audit, genuinely unavailable-session behavior and changed-binary/version upgrade are not qualified by this retest. Fresh actual-host behavior after logout was not repeated here; normal CLI logout was verified.
- After removing temporary Codex registrations, app-server config reload returned `invalid transport in mcp_servers.huly-pr318`. The config file was verified to contain no test entries; only owned test MCP processes were explicitly terminated. This host cleanup issue is recorded separately from the application's verification results.

## Cleanup and artifacts

All disposable keychains removed; original `login.keychain-db` default and search list restored. Both native and file test credentials logged out; test profile metadata retained. All four temporary Codex registrations removed from configuration and owned test MCP processes terminated. Personal Keychain was never locked. Canonical checkout dependencies were not reinstalled. No code changes, commits, PR comments, merges or publication.

- [Full gate](macos-pr318-retest-2026-10-15/check-all.log)
- [Native CRUD](macos-pr318-retest-2026-10-15/native-probe.log)
- [Live assertions and cleanup](macos-pr318-retest-2026-10-15/qualification.log)
- [Final actual Codex read](macos-pr318-retest-2026-10-15/codex-final.log)
- [First host timeout](macos-pr318-retest-2026-10-15/codex-host.log), [second timeout](macos-pr318-retest-2026-10-15/codex-retry.log)
- [Host startup during lock](macos-pr318-retest-2026-10-15/codex-locked.log)

Throwaway assertion harness and packed artifacts remain under `/tmp/hulymcp-pr318-*`; implementation checkout remains at `/tmp/hulymcp-macos-pr318`.
