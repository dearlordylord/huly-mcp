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

Next behavioral increments: cancellation/EOF/death with continued use of the
surviving adapters; stdout-close/slow-consumer limits and failure propagation;
truthful missing-terminal-response handling; initialization and legacy session
bridging; supported interactions/continuations. The current adapter is an early
experimental path, not a complete protocol bridge. No full quality gate,
coverage receipt, fresh review, Quint check, local-Huly demonstration, native
macOS/Windows evidence or final packaged qualification exists for this candidate.
