# PR #318 — final macOS qualification verdict, 2026-10-15

**Verdict: FAIL. Do not mark #293 accepted.** The remaining executable qualification scenarios were exercised after the initial retest. This is a failing acceptance result with concrete reproductions, not a handoff of unexecuted tests to the operator.

Candidate: `5321afc3942e9e373168d5bd7910ae8457517cfd`, rechecked against [PR #318](https://github.com/dearlordylord/huly-mcp/pull/318). No implementation edits. macOS 27.0 / 26A428 arm64, Node v25.6.1, pnpm 10.29.3; actual running Codex app-server 0.163.0. Same OS account/session and local Huly integration workspace as the [preceding retest](macos-pr318-retest-2026-10-15.md).

## Findings that prevent acceptance

### F1 — unavailable selected keychain can still lose credential linkage

**Observed:** remove the disposable credential keychain from the user's search list while restoring the original default keychain. The test secret is still physically present in the disposable keychain. Read fails, but `auth logout` exits **0** and reports success, deleting the credential reference. Returning the keychain to the search list leaves the original secret present, but `auth check` exits **2**.

Exact executed sequence:

1. Use the installed packed CLI to save a valid local-Huly token into an unlocked disposable keychain via hidden token import.
2. Restore the original default keychain and explicitly include the disposable keychain in the search list. Confirm successful live `auth check`.
3. Remove only the disposable keychain from that search list. Do not delete its file or credential.
4. Offline status remains configured/unverified. CLI read exits 2 with `INVALID_INPUT`, advising login rather than restoring keychain availability; metadata is unchanged by read.
5. Fresh actual Codex MCP startup fails; credential metadata remains unchanged.
6. CLI logout exits 0 with “Logged out of Huly profile 'macos-pr318-completion'.” Credential metadata changes.
7. Restore search-list membership. The exact original credential entry still exists, but CLI check exits 2 because the reference was discarded.
8. Restore the disposable profile by explicit token import, then clean up the fixture.

The documentation says to keep the credential keychain in the search list. This reproduction is deliberately outside that availability precondition: issue #293 also requires missing/unavailable native facilities to fail safely and report deletion failures accurately. The new locked-with-search-list fix passes; it does not cover this unavailable-keychain case. This test does not claim to emulate a different macOS login session or a failed securityd service.

Relevant implementation: `src/profiles/macos-keychain.ts` maps lookup status 44 to absent and treats absent as successful removal; `src/profiles/routed-credential-store.ts` then drops the selected reference. A reference to an inaccessible keychain is observationally conflated with a credential that was actually deleted.

### F2 — actual MCP host receives no actionable native-storage failure

**Observed twice**, with locked and unavailable keychain states: CLI emits a typed error, but a fresh actual Codex-launched packed MCP process closes during handshake. Codex shows only `connection closed: initialize response`. Captured server stderr is **empty**. Metadata is retained by the failed host read, and locked-state recovery works after unlock, but the user gets no explanation that Keychain is the problem or how to recover.

The installed MCP was launched by the existing Codex app-server through a minimal shell wrapper that only redirects stderr to a private evidence file. It ran under the same OS user/session with `HULY_PROFILE=macos-pr318-completion` and explicit removal of URL/workspace/password/email/token overrides. The test held the failure state until the host request finished, then checked file preservation and recovery. No cached successful MCP process was used for the failure test.

The same generic startup failure occurs for a fresh MCP host after normal logout. It correctly refuses access, but provides no actionable missing-credentials instruction.

### Additional observed host-startup failure after update

The actual-host predecessor read succeeded. After replacing both packed executables in the same installation directory with the corrected candidate, fresh Codex startup timed out at its unchanged 30-second handshake budget. CLI native/file/environment-backed access after that upgrade passed. Earlier candidate-host attempts also timed out, while the previous retest's final candidate host read succeeded. The cause remains unestablished; this is retained as failed startup evidence, not attributed conclusively to the authentication change or erased by a successful retry.

## Completed qualification matrix

| Requirement/scenario | Result |
| --- | --- |
| Real native write/read/replace/delete | PASS, preceding retest |
| Packed hidden-password login, offline status, explicit live check | PASS |
| Hidden token replacement and rejected invalid token, retaining previous credential | PASS |
| Locked CLI read and logout with keychain still in search list | PASS, typed Keychain error and byte-identical metadata |
| Locked import with actual macOS dialog rejection | PASS on completed retry: exits 1 in 5.89s, actionable Keychain guidance, no harness timeout, byte-identical metadata; prior credential verified after explicit unlock |
| Actual-host locked read and recovery | Access refusal/preservation/recovery PASS; actionable diagnostic FAIL (F2) |
| Unavailable keychain CLI/actual-host reads | Access refused and metadata preserved; diagnostics deficient |
| Logout while selected keychain unavailable | FAIL (F1) |
| Upgraded executable uses existing native/file profiles without re-login/backend migration | PASS |
| Upgraded executable uses complete environment credentials | PASS |
| Fresh actual-host startup after executable replacement | FAIL: 30-second handshake timeout |
| File and complete environment access with native keychain locked | PASS, preceding retest |
| Native metadata and file inspection | PASS: no native token in file-token map, native reference contains only backend/destination/key/retiredKeys, profile only backend/URL/workspace, JSON files mode 0600; no app-owned decryption-key sidecar identified |
| Normal logout removes native entry, preserves profile/selection, new CLI requires credentials | PASS |
| Fresh actual-host start after logout | Refuses access; generic handshake diagnostic (F2) |
| Complete quality gate | PASS on exact unchanged candidate: 420 files / 5461 tests; statements 99.47%, branches 99.00%, functions 99.04%, lines 99.57% |

### Update evidence

This was a real **code replacement**, not reinstalling identical candidate bytes. The predecessor packages built at `7cab9cbe` were installed into `/tmp/hulymcp-auth-upgrade`; both native and file profiles verified under that CLI and actual Codex read projects from that MCP. Both packages were replaced in place with builds of `5321afc3`. SHA-256 changed for **both** executable files, as recorded in the before/after manifests. The package version labels were unchanged (CLI 0.51.1 / MCP 0.53.1); this qualifies executable replacement, not a semantic-version bump or a Node-code-signing identity change.

### Prompt observations and fixture repair

The operator explicitly confirmed clicking Cancel on the macOS `qualification` unlock dialog. The first denied-import attempt returned a correct failure in 8.23s and retained metadata, but its fixture unlock/cleanup failed, so its recovery was not counted. The disposable fixture was removed, the disposable profile reauthenticated, and the complete test repeated with private fixture-recovery information and improved cleanup. That retry passed refusal, preservation, unlock recovery and cleanup. No personal login-keychain password was requested or used; only the random disposable-keychain password was used by the fixture controller.

CLI commands used real PTYs for hidden input. Computer Use refused access to protected SecurityAgent and Terminal.app, so no claim is made of an automated exhaustive visual audit of every possible system prompt or a separate Terminal.app GUI run. The operator's confirmed rejection plus real process outcomes provide the explicit denial evidence. No claim that updates suppress OS prompts is made.

## Cleanup

Completion-test native and file credentials logged out; disposable keychain and its private recovery-secret file removed. Original default and search list restored to `login.keychain-db`. Profile metadata retained as specified. All owned MCP test processes stopped.

Codex's current runtime retained stale per-server configuration references and rejected reload after complete removal of temporary registrations (`invalid transport`). To leave the live host valid and stop all test launch paths, the owned registrations were replaced with **disabled inert placeholders** (`enabled=false`, `command="/usr/bin/false"`), with no credentials, environment variables or temporary executable paths. Reload then succeeded. This is host cleanup state, not a change to the PR.

No implementation edits, commits, issue updates, PR comments, merges or publication were performed.

## Evidence

- [Live outcomes, timings, preservation and recovery](macos-pr318-qualification-final-2026-10-15/qualification.log)
- [Locked actual-host failure](macos-pr318-qualification-final-2026-10-15/locked-host.log), [empty captured server stderr](macos-pr318-qualification-final-2026-10-15/locked-server.stderr)
- [Unavailable actual-host failure](macos-pr318-qualification-final-2026-10-15/unavailable-host.log), [empty captured server stderr](macos-pr318-qualification-final-2026-10-15/unavailable-server.stderr)
- [Pre-upgrade host success](macos-pr318-qualification-final-2026-10-15/codex-before-upgrade.log), [post-upgrade host timeout](macos-pr318-qualification-final-2026-10-15/codex-after-upgrade.log), [CLI upgrade assertions](macos-pr318-qualification-final-2026-10-15/upgrade.log)
- [Before hashes](macos-pr318-qualification-final-2026-10-15/upgrade-before.sha256), [after hashes](macos-pr318-qualification-final-2026-10-15/upgrade-after.sha256)
- [Fresh host after logout](macos-pr318-qualification-final-2026-10-15/codex-final-logout.log)
- [Failure reproduction harness](macos-pr318-qualification-final-2026-10-15/native-failure.py), [denied-import harness](macos-pr318-qualification-final-2026-10-15/locked-import.py), [shared hidden-input helpers](macos-pr318-qualification-final-2026-10-15/qualify.py). These are captured throwaway host harnesses with absolute temporary paths; configure paths and source the local integration environment before replay. No secrets are embedded.
- [Exact-candidate full gate](macos-pr318-retest-2026-10-15/check-all.log)
