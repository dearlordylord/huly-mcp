# Issue 324: managed resident startup

Status: incomplete. The selected design is recorded in
[Managed resident ownership](resident-managed-design.md).

## Implemented foundation

`selection-claim.ts` creates an exclusive protected-directory claim. Only its
creator receives the one-use release operation. Repeated release cannot affect
a later claim. Changed inode ownership and failed cleanup retain blocked state.
`withSelectionClaim` releases normal ownership after use, failure, or interruption.

`start-authorization.ts` makes the child authorization decision irreversible.
Start permits one claim; disconnect or timeout before Start commits to exit.
The production IPC launcher has not yet been wired to these decisions.

`McpProcessPolicy` now owns the parsed tool-selection and exposure contract used
by `McpServerService`. Startup loads it once through the existing ConfigProvider.
An embedding can supply an already captured policy without rereading changed
environment values. Tool-scope resolution consumes parsed selections directly.
All callers of its former raw-string contract have been migrated.

Scope decoding rejects unnormalized, duplicate, empty, and comma-containing
entries. Environment CSV parsing preserves its existing normalization, unknown
entries, and first-occurrence order. Sorting the selection would change visible
metadata order, so compatibility must preserve that order. This prepares the
shared configuration handoff for #325; it does not implement authority matching.

## Evidence and limits

The focused claim and authorization tests pass, including ten independent Node
children using the production claim function. One child acquires ownership and
nine are refused. After SIGKILL of the winner, a later child refuses takeover.
Tests also exercise replacement ownership, repeated release, failed cleanup,
operation failure, and interruption.

TypeScript and Effect diagnostics passed for the initial foundation and process
fixture. Focused formatting and lint checks passed. The complete foundation
gate and fresh reviews are recorded below. The coherent managed-startup
candidate still requires its own qualification.

The process-policy increment passes the affected server, HTTP, scope, exposure,
and property suites. A server-layer test supplies captured policy alongside
conflicting and invalid environment policy and observes the captured toolsets.
The new serialized policy checks retain existing defaults and typed failures.
The first full foundation gate failed branch coverage at 98.99% despite 5,528
passing tests. A real Linux path-limit fixture now exercises non-conflict claim
creation failure and verifies that no claim remains. The corrected full gate
passes 434 files and 5,529 tests with all original thresholds. Its receipt is
`/tmp/resident-managed-foundation-check-all-corrected.log`.

Fresh Standards review identified an impossible-product authorization decision
type. The decision now permits only authorized with claim or none, or retired
with exit or none. Standards read back that fix and the path-limit fixture and
has no remaining finding. Fresh Spec review has no scoped defect. This verifies
the foundation increment, not complete managed startup or any whole issue.

## Remaining work

Freeze registry and IPC inventory bounds and the complete startup deadline.
Wire the recorded compatibility protocol, shared explicit and automatic ownership, private child
configuration transfer, authenticated discovery and admission, and outer resource
retirement. Add the packaged failure schedules and align implementation
observations with the lifecycle model. Final live Huly and native-platform
qualification remain pending. No complete issue criterion is accepted by these
foundation tests alone.
