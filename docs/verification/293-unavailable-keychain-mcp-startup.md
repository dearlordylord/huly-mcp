# #293: unavailable Keychain and MCP startup follow-up

Base: merged PR #318, `4e761a07` (same runtime as host candidate `5321afc3`).
Authoritative failing host evidence is preserved unchanged in
[the final qualification report](macos-pr318-qualification-final-2026-10-15.md)
and its linked logs. This correction does not close #293.

## F1: unavailable storage is not proof of deletion

macOS removal now refuses an entry absent from the current search list before
deletion, and refuses a delete command that reports item-not-found. Only an actual
successful delete followed by an absence confirmation permits reference removal.
Reads through an existing native reference surface a typed storage-availability
error instead of generic missing-login guidance. Both lock and search-list
exclusion preserve the active reference and recover after access is restored.

Confirmed retired-key cleanup is recorded in metadata. Logout checks active
access first, then completes retirement cleanup before deleting the active entry.
Retirement or receipt-write failures retain active access. This addresses a Spec
review finding: strict missing-entry handling must not retry already-confirmed
retired deletions after a successful replacement. Legacy unknown retirement IDs
are not silently forgotten: uncertain cleanup fails conservatively, keeping the
selected credential. No automatic migration or plaintext fallback is introduced.

## F2: expose profile errors within MCP

Profile startup errors now start a diagnostic-only MCP session rather than close
the transport before handshake. The session writes secret-free guidance to
stderr and advertises only `get_huly_startup_diagnostic`; initialize/discovery
instructions, the tool description and its typed error result carry the recovery
message. Restart the MCP server after restoring access. No Huly operation is
available while the profile is unresolved.

The protocol is shared with the existing unsupported-Node diagnostic server.
Released SDK clients exercise legacy initialize and modern server/discover,
list tools and call the diagnostic tool in real child processes. Reader EOF and
interruption release the owned readline interface.

## Evidence and remaining qualification

Focused adapter, shared-store and protocol tests pass, including real-file
lock/unavailable preservation, replacement then logout, retirement failures,
legacy/current SDK process sessions and reader cleanup. Fresh Standards and Spec
reviews report no remaining demonstrated findings after the retirement fix.
A local-Huly packed CLI/shared stdio profile workflow passes with successful
project reads, destination refusal and diagnostic-only startup after logout.

The macOS workflow now installs both packed packages and tests search-list
exclusion, lock, recovery and post-logout diagnostics through real SDK clients.
Candidate `6cce4477` passes fresh local `pnpm check-all`: 423 files / 5,472
tests; coverage statements 99.47%, branches 99.00%, functions 99.03%, lines 99.57%.
Build, TypeScript/Effect diagnostics, architecture, complexity, lint/duplication
and complete test gates pass. The installed CLI/shared stdio workflow also passes
against real GNOME Keyring 42.1 / private session D-Bus and local Huly, including
lock and missing-session diagnostics, replacement preservation and unlock
recovery. Two preceding native-fixture runs failed before this passing receipt:
missing `secret-tool` on PATH, then an initial unlock password with an unintended
newline. Neither is credited as passing runtime evidence; the fixture setup was
corrected without weakening checks. No dependencies were reinstalled in the
canonical Darwin checkout.

[macOS run 38830401576](https://github.com/dearlordylord/huly-mcp/actions/runs/38830401576)
has passed real CRUD and the installed CLI/MCP unavailable/locked/recovery/logout
fixture on `6cce4477`. Both SDK protocol versions receive the diagnostic-only
session. Node 22/24 CI ([run 38830401672](https://github.com/dearlordylord/huly-mcp/actions/runs/38830401672))
and Package Smoke ([run 38830401578](https://github.com/dearlordylord/huly-mcp/actions/runs/38830401578)) pass.
The first complete macOS gate fails in the unchanged resistant-descendant
process-group cleanup test: `permission denied`, with 5,471 tests passing and
one failing. This is not credited as a passing gate. The single failed-job rerun on the same candidate passes that process-group
test but fails the unchanged private-token-input `64 KiB` rejection test at its
5-second timeout (5,471 passed / one failed). Native CRUD and the installed
CLI/MCP fixture pass again. Thus neither macOS full gate is credited as passing;
no process-custody behavior, test expectation or timeout was changed. Further
macOS harness qualification remains pending. An earlier complete run passed 5,466 tests but failed branches at 98.99%;
subsequent retirement changes require a new receipt. No thresholds, timeouts,
inventory or diagnostics were reduced. Intermediate compiler/lint failures were
corrected without changing their gates.

Actual Codex presentation after this correction has not been observed. The
report's separate normal-start timeout after executable replacement remains an
unestablished failure; a diagnostic-handshake test does not prove its cause or
resolution. Keep these limitations distinct from the F1/F2 correction evidence.


Local receipts on `6cce4477`:

- [Complete gate](293-unavailable-keychain-mcp-startup/local-check-all.log): PASS, 5,472 tests and all four coverage metrics at least 99%.
- [File profile / local Huly](293-unavailable-keychain-mcp-startup/local-file.log): PASS.
- [Real Secret Service / local Huly](293-unavailable-keychain-mcp-startup/local-native.log): PASS, including CLI/MCP lock and missing-session diagnostics and recovery.

These receipt files were scanned for secrets before retention. The predecessor's
host qualification remains FAIL; these are new-candidate evidence, not edits to
its observations.
