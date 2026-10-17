# Resident recovery design decision

Status: selected lifecycle contract, implementation and qualification incomplete.
[ADR 0003](../adr/0003-adopt-mcporter-resident-lifecycle.md) supersedes the earlier
conditional guardian/restricted-worker design. [ADR 0002](../adr/0002-resident-recovery-without-operation-journal.md)
removes the operation journal. Neither decision claims completed recovery or
approval of pending Quint transition logic.

## Selected ownership practice

Adopt the researched MCPorter pattern: exclusive cross-process startup,
authenticated readiness, protected atomic ownership metadata, generation-bound
attachments and cleanup, graceful drain and bounded refusal after unresolved
owner loss. The transient launcher starts the native shared backend. The backend
owns its resources and generation publication; a separate guardian or restricted
SDK worker is not required.

Retain our native loopback HTTP/TLS transport and one backend per compatible
resolved configuration. Do not copy a universal broker or adopt another
application's timeouts. Existing startup, cleanup and lease bounds stay in force.

When the backend is healthy, client closure/cancellation affects its own work,
and ordinary idle retirement protects queued and active requests. A backend
crash may interrupt all attached clients. Possible remote Huly commit followed
by response loss has the same uncertainty as standalone stdio; no stronger
data-loss-prevention, rollback, failover or operation history is promised.

## Replacement and refusal

Automatic startup is required when no unresolved owner exists and after confirmed
normal retirement. Selection and publication serialize compatible launchers.
A generation's cleanup cannot remove another generation's records.

Unexpected backend-owner exit may leave unresolved owned resources. Preserve
ownership metadata, report bounded actionable refusal and require verified local
retirement before resetting state. Failed or unconfirmed cleanup likewise blocks
overlapping replacement. A stale PID, unresponsive port or missing locator alone
never authorizes signalling, deletion or takeover. Concurrent callers can select
one fresh generation after retirement has been verified. Transparent automatic
replacement after unverified owner loss is not required.

Use a protected per-user production lifecycle namespace. Deliberate same-user
deletion/replacement of live ownership state is not supported automatic recovery.
Detectable missing/corrupt expected state refuses selection. A complete namespace
reset requires stopping and verifying actual owned local processes/resources;
absence of all files is not retirement evidence. This explicit threat boundary
supersedes the earlier open-ended arbitrary-erasure proof obligation.

## Request outcomes

Each invocation stays with its original adapter incarnation, request and
generation. The adapter never restores or automatically replays it. Once dispatch
is possible, missing terminal evidence leaves the outcome unconfirmed. Report
uncertainty when output remains usable; abrupt process death can prevent any
report. A host-observed terminal result remains known despite later disconnect.

There is no durable per-operation ledger, persisted replay queue or cross-session
operation-status lookup. Ordinary redacted diagnostics and test receipts remain
valid evidence. Local retirement and healthy replacement do not settle a remote
Huly mutation. An ordinary read without an operation-specific reconciliation
contract does not resolve the old outcome. Independent new work may proceed
after safe local replacement; repeating an uncertain mutation still requires
operation-specific reconciliation or remote idempotency.

## Next implementation evidence

Implement the bounded stale-owner status and verified-cleanup/replacement path,
using the original ownership capabilities. Preserve all separate-parent launch,
identity, routing, cancellation, idle, version and fault cases. The old restricted
SDK experiments remain historical observations, not prerequisites for a guardian
architecture. Model the selected caller/backend lifecycle and verify the observed
transitions; typechecking alone proves no lifecycle property.

Keep ten-second startup selection, five-second cleanup confirmation, all current
coverage/diagnostic gates and native-platform requirements. Final live Huly
integration remains scheduled after the complete implementation. No package
publication, service installation, default promotion or prototype deletion is
authorized by this design amendment.
