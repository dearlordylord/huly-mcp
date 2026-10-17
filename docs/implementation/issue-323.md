# Resident manual adapter: #323

Status: implementation in progress; no acceptance criterion is certified.

## Resumed candidate

On 2026-10-17, resumed from `HANDOFF-resident-mcp-323-328.md` and fetched the
current GitHub bodies for #322–#328. The handoff records uncommitted implementation
at `/private/tmp/hulymcp-resident-implementation`, which is unavailable in this
Linux environment. Git retains that worktree registration and the branch at
`1e74e62561654893c17c6439cbf06190dc316857`. Neither was removed or reset.

The Linux continuation is `/tmp/hulymcp-resident-linux`, branch
`implement/resident-mcp-linux-323-328`, based on the same commit. Existing canonical
untracked evidence and the prototype branch remain untouched. Missing uncommitted
macOS files must not be described as recovered or tested here.

## Immediate verification boundary

Reconstruct streaming response decoding before wiring the adapter. JSON and SSE
must retain their native envelopes, forward progress before stream completion,
and bound body consumption. The decoder accepts an explicit byte budget owned by
the eventual adapter policy; this step does not establish a measured production
budget. No response is retried or replayed by the decoder.

The initial focused Vitest invocation could not load Linux Rollup's native module
from canonical shared dependencies. This is a harness startup failure, not a red
behavior test. Its log is `/tmp/resident-response-red.log`. A frozen dependency
installation was started in this isolated Linux worktree only; canonical shared
dependencies were not reinstalled.

## Verified Linux increment

Frozen installation completed successfully with Linux-local dependencies.
The own-package launcher now selects `src/resident/manual-adapter-main.ts` only
for explicit `MCP_TRANSPORT=stdio-http`. It parses a loopback-literal HTTP endpoint
from `MCP_STDIO_BACKEND_URL` and redacted local authorization from `MCP_AUTH_TOKEN`.
It does not resolve Huly credentials, start a backend, discover a listener, or
retry a request. Standard startup retains its original branch.

The adapter consumes bounded NDJSON input and JSON/SSE backend bodies. Request
fibers are owned by the adapter scope; cancellation interrupts the matching HTTP
stream. It uses a bounded serialized output queue and rejects mismatched response
IDs. Current numerical admission limits are provisional: 1 MiB input lines,
128 MiB total response bytes per request, eight concurrent operations and sixteen
queued output lines. These are not qualified throughput or memory budgets.

The packaged JSON and SSE routing cases failed before launcher implementation
with `SchemaError: Missing key at ["result"]["host"]`:
`/tmp/resident-process-red.log`. Both then passed. The cancellation case also
passes: one adapter receives progress from an open SSE response, cancels it, and
the fixture observes HTTP stream closure; the other adapter completes another
read. This fixture is a real owned Node HTTP server, not a Huly integration.

Current focused evidence:

- `/tmp/resident-transport-regressions.log`: 27 tests passed across resident
  decoding/process tests, existing stdio process lifecycle and HTTP transport.
- `/tmp/resident-adapter-typecheck-final-increment.log`: TypeScript passed;
  Effect checked 1,193 files with zero errors/warnings.
- Earlier adapter typecheck attempts failed first on the output queue's missing
  completion type, then on an incorrect `Done` import. These were corrected to
  the installed `Cause.Done` queue contract; those failed runs are not passes.

The process fixture uses separate adapter subprocesses under the test runner.
Independent parent launch races remain untested. Cleanup terminates and awaits
the owned adapter children and closes the owned HTTP listener/connections.

## Remaining scope

All #323 criteria remain open: explicit attachment identity/authentication,
packaged multi-process stdio/HTTP exchange and routing, modern/legacy context,
cancellation, bounded output/admission, Quint observations, documentation,
local-Huly demonstration, full quality gate and Standards/Spec review. #324–#328
remain required under the unchanged parent contract. The superseded prototype
may be removed only after production integration and qualification.

Remaining behavioral work includes cancellation during shared acquisition,
measured admission and byte budgets, initialization and legacy session bridging,
and supported interactions and continuations. The current adapter is an early
experimental path, not a complete protocol bridge. No full quality gate,
coverage receipt, fresh review, local-Huly demonstration, native macOS or Windows
evidence, or final packaged qualification exists for this candidate.

## Response lifetime and output increment

The adapter now keeps output failures in the typed failure channel. The previous
entrypoint caught failures and returned success, which prevented NodeRuntime's
failure teardown from forcing exit. Closed stdout reproduced that hang. The
entrypoint now prints a redacted diagnostic and lets NodeRuntime exit with code 1.
An unread stdout also reproduced a hang. Each serialized output write now has a
10-second allowance, matching the existing ordinary stdio shutdown deadline.
It uses Effect time and does not change existing transport deadlines.

The process checks confirm that EOF or `SIGKILL` closes the first adapter's HTTP
stream while the second adapter remains usable. Request cancellation also leaves
the first adapter usable for another call. The closed and unread stdout checks
confirm that the affected adapter exits and the surviving adapter can read again.

An SSE response ending without a terminal reply previously left the adapter
waiting silently. A fault-timing event now ends the fixture response after the
test receives progress. The regression timed out before the completion check.
The corrected implementation reports an unknown outcome and performs no replay.
The response phase and ownership decisions are pure functions. Duplicate and
foreign terminal replies are rejected before admission to stdout.

Evidence from this increment:

- `/tmp/resident-eof-death.log`: five packaged routing and release scenarios passed.
- `/tmp/resident-output-red.log`: closed and unread stdout both exceeded the
  existing fixture's 15-second exit bound. Both cases pass in
  `/tmp/resident-output-green.log` after the fixes.
- `/tmp/resident-missing-terminal-red-confirmed.log`: the missing-terminal check
  timed out after five seconds with the completion check removed. The check was
  restored before subsequent verification.
- `/tmp/resident-observed-lifecycle.log`: all 15 resident tests passed, including
  six packaged scenarios with observed response decisions replayed in Quint.
- `/tmp/resident-observation-typecheck-2.log`: TypeScript and Effect diagnostics
  passed for 1,196 files with zero errors or warnings.
- `/tmp/resident-response-model-script.log`: six deterministic Quint tests and
  10,000 sampled traces passed. All five witnesses were reached.
- `/tmp/resident-response-model-mutant.log`: allowing a second terminal reply
  violated `safety`, with a trace showing `accepted: 2` in one request context.
- `/tmp/resident-lifecycle-final-increment.log`: all 15 resident tests passed on
  the final increment, including rejection of a contradicted observation trace
  and confirmation that the missing-terminal failure itself was observed.
- `/tmp/resident-lifecycle-final-typecheck.log`: TypeScript and Effect diagnostics
  passed for 1,196 files. Focused lint and complexity passed in
  `/tmp/resident-lifecycle-final-lint.log` and
  `/tmp/resident-lifecycle-final-complexity.log`.

An intermediate replay check failed because the test expected the failed run's
name in the subprocess Error message. Quint writes that name to stdout, while
the Error message included stderr's `error: Tests failed`. The assertion now
checks that actual model-test failure. The original assertion failure is retained
in `/tmp/resident-model-alignment-checked.log`; it is not a runtime failure or a
passing check.

The [response model reference](../../quint-specs/resident-response-ownership.md)
records its bounded domain and unmodeled requirements. This adds local replay
alignment for response decisions. Full adapter lifecycle observation and the
remaining parent invariants are still pending. No #323 acceptance criterion or
later ticket is certified by this increment.
