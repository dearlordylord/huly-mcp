# Resident adapter and native session ownership

## Problem

The authenticated generation descriptor selects a backend, but does not identify
an adapter. Native legacy UUIDs survive request disconnect in `bySessionId`.
Admission, owned work and session release need one backend owner, while native
protocol negotiation and the existing target-cleanup barrier remain authoritative.

Grounding at `549db0e9` includes the actual native runtime, project HTTP middleware,
migration history and fresh reads of open #322, #323 and #326. Native UUID deletion
is missing; the record does not establish that indefinite retention was intended.
Private adapter identity remains distinct from legacy UUIDs and modern metadata.

## Usage

```ts
// Package adapter: one scoped capability hides control traffic and renewal.
yield* withAdapterAttachment(selectedGeneration, (exchange) => runStdioBridge(exchange))

// Resident only: one owner supplies private controls and native request context.
const admissions = yield* makeResidentAdmissions(policy)
yield* serveNativeMcp(residentAdmissionMiddleware(admissions))
```

These show the implemented scoped ownership shape. The server composition also
includes its request context and outer native transport policy.
Ordinary stdio and direct HTTP omit the private owner and retain their behavior.

The resource core now exists as `makeAttachmentOwner`. Its scoped `withWork`
accepts explicit `use` and `cleanup` effects. Only successful cleanup certifies
ticket completion; typed cleanup failures and defects retain a blocked ticket
and native capabilities. A generation-scoped drain fences admission and signals
owned cancellation. Close callers interruptibly join that same drain, so a
caller deadline leaves cleanup ownership alive. Production admission supplies the bounded close policy and wraps the actual
HTTP target-retention lifecycle.

## Shape

One generation-owned registry tracks accepting, closing and blocked attachments,
their retained work tickets and native session release capabilities. Work is
counted independently from attachment liveness. A request reserves a ticket before
native admission or Huly acquisition. Its cleanup signal follows actual target
cleanup and the existing request-client retention barrier.

Schema-owned private admit, renew and release controls run over the existing
authenticated channel. The adapter exposes one scoped exchange capability.
Controls, private headers, renewal and release stay inside that module. A legacy
UUID is usable only through the attachment that adopted it. Modern traffic gains
no durable MCP session. The native runtime retains all negotiated protocol data.

Release closes admission, interrupts only owned work, waits for its cleanup, then
runs owned native release capabilities. Repeated release joins the same outcome.
Failed cleanup retains blocked ownership and cannot authorize replacement or
ordinary idle retirement. Release never establishes non-dispatch or permits replay.
Unknown dispatched outcomes remain unconfirmed under #327. Their evidence lifetime
is defined by ADR 0002; no durable per-operation ledger is required.

## Native adoption transaction

An optional request Context service adopts a newly initialized HTTP UUID before
response headers expose it. Registration and cleanup installation are one
uninterruptible acquisition. Adoption remains interruptible; any failure or
interruption removes that newly registered entry. A successful adoption transfers
its release capability to the owner. The closure removes only its captured native
session object, so an old capability cannot remove another entry reusing its key.

The installed native initialize contract has no typed failure channel. A closed
request may therefore decline adoption as cancellation, with rollback, rather
than widening every native initialize RPC. Other expected admission failures are
parsed and returned before native initialization. This is a concrete refinement
of candidate A's proposed protocol-error channel, constrained by installed types.

An in-flight initialization may adopt into its closing owner only while its work
ticket remains retained. A callback without a live reservation cannot create an
orphan or reopen admission. Closing a request socket or clearing an adapter Ref
does not count as native UUID release. The native hook has no Huly, private-route,
lease-timer or project-registry knowledge.

## Synthesis decision

Candidate A, explicit controls plus per-request capability adoption, is the base.
The parent and independent judge scored A 14/15 and B 12/15 against ownership,
native integration, cleanup safety, interface depth and falsifiability. B's
persistent duplex control stream adds a second streaming/backpressure protocol
before its required flushing and cancellation experiments have passed. Its public
API could be equally small, but it hides more unqualified machinery.

Retain B's explicit unknown-outcome retention rule and paused/resumed process test.
Both candidates require transactional native registration and actual target
cleanup evidence. Do not add a header observer, runtime-wide session deletion API,
duplicate work counter, or both control protocols. Available models are GPT-family
only; independent roles used the inherited model rather than unavailable defaults.

Candidate, grounding and judgment artifacts are in `/tmp/resident-session-*`.
They are design evidence, not process qualification.

## Limits and first experiments

The first experiment must use actual native initialization and lookup. It must
observe release of one UUID while another remains usable, failed/interrupted
adoption rollback, repeated release and unchanged absent-hook direct HTTP.
Then hold actual target cleanup while releasing an attachment and prove that
session removal waits. HTTP response completion alone is insufficient evidence.

Explicit controls now use the measured policy recorded in
[resident-lease-policy.md](resident-lease-policy.md). Server-issued random
capabilities expire without client acknowledgment, including when admission's
successful reply is lost. Registry capacity is bounded; cleanup failure retains
its slot. Monotonic eligibility is checked at reservation and renewal, so a
paused adapter cannot revive an expired identity. The adapter stops on heartbeat
failure without readmission or replay.

Real TLS tests cover lost replies and actual target cleanup. Packaged process
tests cover death and pause/resume with an independent survivor. The attachment
Quint model covers bounded lease transitions, but implementation observation
alignment, managed idle retirement and truthful unknown-outcome recovery remain
pending. Calibration is limited to Linux metadata traffic without live Huly;
it does not qualify final platform support or real Huly performance.

The later [ADR 0002](../adr/0002-resident-recovery-without-operation-journal.md)
clarifies the unknown-outcome policy. There is no durable per-operation ledger.
Unknown outcomes are not replayed or inferred from lease expiry, local process
retirement or a healthy replacement. A new adapter provides no historical
operation-status lookup. Existing redacted diagnostics and test receipts remain
valid evidence; this amendment does not claim recovery implementation is complete.
