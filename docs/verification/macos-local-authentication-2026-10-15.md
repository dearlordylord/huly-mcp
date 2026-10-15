# macOS local authentication qualification — 2026-10-15

**Verdict: FAIL; do not mark #293 qualified.** Happy-path packaged CLI and actual Codex MCP access work. Locked-keychain logout falsely succeeds, drops the selected credential reference, and leaves the secret behind. The full quality gate also fails on macOS.

## Candidate and environment

- Candidate: `implement/local-auth-301-293-302`, commit `7cab9cbe6d0e6e9042e36b547d6ef09dd835cc0b` (no implementation modifications).
- Checkout: `/private/tmp/hulymcp-macos-auth`; independent Darwin dependencies installed with `pnpm install --frozen-lockfile`. Canonical checkout dependencies were not reinstalled.
- macOS 27.0, build 26A428, arm64; Node v25.6.1 at `/opt/homebrew/bin/node`; pnpm 10.29.3.
- Packed CLI `@firfi/huly-cli@0.51.1`; packed MCP `@firfi/huly-mcp@0.53.1`; both installed at `/tmp/hulymcp-macos-installed`.
- Actual running Codex app-server 0.163.0, local CLI 0.162.1. Read performed through the existing app-server/thread and directly through the newly loaded `mcp__huly_macos_qualification__list_projects` tool. No second model task was spawned.
- Local Huly `http://localhost:8087`, workspace `test-workspace`, existing local integration account; disposable profiles `macos-qualification` and `macos-qualification-file`. Huly operations were authentication and reads only.
- Telemetry disabled. Password/token prompt input supplied through PTYs; secrets compared in memory against captured output and application JSON, without emitting their values.
- CLI tarball SHA256: `cb9466ec07678fa56d101a881a6a631cb17613ed4d202f679d7d43239558f0a0`.
- MCP tarball SHA256: `5cc082f50f417d92d61c7ee754f211af3e67eac36854ca8e57b05ac40b653c4f`.

## Checklist results

| Item | Result | Evidence and limits |
| --- | --- | --- |
| 1. Build/native CRUD | PASS | `pnpm build`; real native write/read/replace/delete probe passes. Initial probe with master's shared dependencies failed because the new native dependency was absent; fresh candidate dependencies resolved this setup issue. |
| 2. Packed CLI native login | PASS for login; NOT RUN for complete prompt audit | Real hidden password prompt, explicit `--storage os`, successful native credential storage. No complete visual record of OS authorization prompts was obtained. |
| 3. Status/check/import/rejected replacement | PASS | Offline configured=true/verified=false; live verified=true; hidden token replacement succeeds; invalid replacement leaves profile and credential metadata byte-identical and previous access verified. |
| 4. Actual MCP host | PASS for read; NOT RUN for complete prompt audit | Codex loaded the installed package with `HULY_PROFILE=macos-qualification`. The launch explicitly removed token/password/email/URL/workspace overrides. Its 8 project identifiers matched CLI exactly; a direct tool call in this conversation also succeeded. |
| 5. Denied/locked storage | FAIL | Disposable test keychain was locked, never the personal login keychain. Offline status succeeds; project read fails with misleading missing-credentials guidance. Logout returns success, changes credential metadata, and leaves the original secret in the locked keychain. Unlocking does not recover profile access. Denied import and fresh MCP-host read under lock were NOT RUN. |
| 6. Replace/upgrade/unavailable session | PASS for same-version package reinstall only; NOT RUN for remainder | `pnpm install --force` in the isolated package directory followed by successful CLI check and Codex project read. This is replacement of the same candidate, not a version upgrade. Changed executable identity, unavailable-keychain session, and full authorization prompt observation remain unqualified. |
| 7. Secret files/fallback modes | PASS for normal-access checks; NOT RUN for denied-state fallback | No test token/password in application JSON; native profile has no file token. Complete environment-backed read and explicitly file-backed login/check succeed. File test credential logged out. No decryption-key audit beyond metadata shape/no-secret checks; no proof that fallback modes avoid native access while access is denied. |
| 8. Normal logout | PASS for deletion/CLI; limited MCP evidence | Unlocked logout removes the native entry, preserves profile metadata/selection, and fresh CLI read requires credentials without terminal prompt. A separately configured fresh Codex MCP process fails startup after logout; Codex surfaces a generic handshake-close message, not actionable credential guidance. |

## Confirmed release blocker: locked logout loses credential linkage

Reproduced with the packed CLI and the real macOS native adapter:

1. Start with a verified native profile and keep the test token in memory.
2. Create/unlock a disposable keychain; temporarily select it as the default and import the same valid token through the hidden CLI prompt.
3. Restore the original default keychain, keeping the disposable keychain in the search list. Confirm the newly selected credential entry is in the disposable keychain.
4. Lock only the disposable keychain. `auth status` still reports configured/unverified.
5. `projects list` exits 2 with `INVALID_INPUT`: “Selected Huly profile has no usable credentials.” It recommends login rather than explaining locked Keychain access. Metadata is preserved by this read failure.
6. `auth logout` exits **0**, reporting “Logged out of Huly profile 'macos-qualification'.” Credential metadata changes.
7. Explicitly unlock the disposable keychain. The original entry **still exists**, but `auth check` exits **2** because the app removed its lookup reference.
8. Restore the profile through token import; restore the original default/search list and remove the disposable keychain.

Relevant implementation: `src/profiles/macos-keychain.ts:32` maps native null to missing; line 47 ignores the return value from `deleteCredential`. `src/profiles/routed-credential-store.ts:74–76` removes metadata after that operation succeeds. These are investigation points; the underlying macOS/native-library return semantics were not instrumented, and no fix is claimed.

The raw execution log includes an earlier optimistic “PASS ... actionable error” label from the first harness attempt. The subsequent explicit `FAIL` and final complete reproduction supersede that label: the guidance is not Keychain-specific and locked logout is a failure.

## Quality gate

- Focused auth/profile tests: **6 files, 51 tests passed**.
- Plain `pnpm check-all`: fails movement process checks because temporary paths under `/var/...` differ from their canonical `/private/var/...` paths. Evidence audit intentionally requires canonical paths.
- `TMPDIR=/private/tmp pnpm check-all`: movement checks, build, typecheck including Effect diagnostics, architecture checks, lint and duplication pass; tests/coverage stage fails: **415 files passed, 2 failed; 5439 tests passed, 3 failed**, plus an unhandled `EPIPE`.
- `test/cli/private-token-input.test.ts`: the 64 KiB and nonterminal cases create profile data with `cliProfilePaths("linux", ...)`, but launch the real Darwin CLI. It cannot find the fixture profile and exits before testing the intended input failure.
- `test/scripts/run-bounded-command.test.ts`: “retains custody when a normal leader exits before group absence is proven” gets `kill EPERM` instead of its expected process-group cleanup diagnostic.
- Coverage thresholds and timeouts were not weakened. No broad unrelated live integration campaign was run.

## Prompt observations and cleanup

No reliable per-application authorization prompt audit is claimed. A `security find-generic-password` helper later timed out. Computer Use explicitly refused access to `com.apple.SecurityAgent` for safety reasons; the user was asked to acknowledge an existing test-entry prompt if visible. Subsequent token reads used the application's native Node adapter, not UI prompt automation. Terminal.app/iTerm2-specific prompting was not separately exercised.

Both temporary Codex MCP registrations were removed and configuration reloaded. Test native/file credentials were logged out. Disposable keychain removed; original login keychain default and search list restored. Test profile metadata remains as required by the logout scenario. Build/install artifacts and throwaway harnesses remain under `/tmp/hulymcp-macos-*`; no application implementation changes, commits, pushes, or issue updates were made.

## Sanitized execution evidence

- [Native CRUD](macos-local-authentication-2026-10-15/native-probe.log)
- [Auth/profile tests](macos-local-authentication-2026-10-15/auth-tests.log)
- [Live qualification outcomes](macos-local-authentication-2026-10-15/qualification.log)
- [Actual Codex host after reinstall](macos-local-authentication-2026-10-15/codex-host.log)
- [Fresh Codex host after logout](macos-local-authentication-2026-10-15/codex-postlogout.log)
- [Original full gate](macos-local-authentication-2026-10-15/check-all.log)
- [Full gate with canonical temporary directory](macos-local-authentication-2026-10-15/check-all-canonical-tmp.log)

Checklist: [candidate macOS qualification](https://github.com/dearlordylord/huly-mcp/blob/7cab9cbe6d0e6e9042e36b547d6ef09dd835cc0b/docs/verification/macos-local-authentication.md). Codex connection used the documented [app-server Unix WebSocket transport](https://learn.chatgpt.com/docs/app-server) and [MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
