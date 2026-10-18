# Resident eligibility policy before lifecycle wiring

This records the proposed timing policy before adding expiring eligibility and
renewal to the production path. The current admission boundary needs this work:
a lost admission reply leaves an owner whose token the adapter never received.
Server-issued capabilities avoid reusable identities and permanent admission
tombstones; their creation must have bounded orphan reclamation.

## Calibration

`test/resident/fixtures/calibrate-admission.ts` builds the package, starts one
owned native resident, and runs five successive cohorts of ten independent host
parents. Every parent starts its own adapter, negotiates modern or legacy MCP,
reads tool and resource-template catalogs, calls `get_huly_context`, then closes
its adapter. The backend capacity is ten, so successive cohorts also require
completed attachment cleanup. The unreachable Huly fixture prevents these
builtins from being mistaken for actual Huly reads or model acquisition.

The monotonic run uses Node v24.20.0 on this Linux container. All 50 parents
completed with correct nonempty catalogs, independent parent/adapter PIDs, and
zero context errors. Cohort durations were 3590, 2580, 2641, 2408 and 2979 ms.
The median parent lifetime was 2055 ms, with range 858–3590 ms. Timed work includes
process startup, protocol traffic and confirmed adapter close; package builds and
backend readiness are outside these intervals. No retries occurred.

Raw report: `/tmp/resident-admission-calibration-monotonic-109c4a85/report.json`.
Bundle SHA-256: `b47e4198510e1d97de4f267720e6d5468d9cbfc13d75a0d865bf40e2c84d30fc`.
The initial wall-clock measurements are superseded by this monotonic run.

A separate ten-parent profiling run is in
`/tmp/resident-admission-profile-109c4a85/`. The backend was mostly idle; its
largest busy regions were package initialization and Effect SchemaAST `isTree`
traversal, with smaller encoding and GC regions. This identifies cold process
and catalog work rather than a saturated backend as the observed constraint.
The profile used the preceding equivalent control-byte-limit expression, so its
bundle hash differs; it supports only that coarse limiter conclusion. Its elapsed
parent measurements are not included above. The machine has 12 logical CPUs;
pre-run load averages were 3.50/4.73/5.34 with other user processes active.
This is a calibration, not a comparative speedup or platform qualification.

## Selected provisional policy

- Eligibility lasts 30 seconds from successful admission or renewal. The backend
  checks a monotonic injected clock. A missing admission reply therefore cannot
  occupy a slot forever. Renewal at or after expiry cannot revive that identity.
- The adapter renews every five seconds while it owns the attachment. Renewal
  uses the same authenticated generation and capability, and has the existing
  five-second control allowance. Failure stops that adapter; no Huly operation is
  retried or transferred to a fresh attachment.
- Expiry fences new work and requests cancellation of that adapter's tickets.
  It does not establish that target work stopped or that a write was undispatched.
  Sessions and capacity remain owned until actual cleanup succeeds. A five-second
  drain acknowledgment reports pending or failed cleanup without clearing it.
- A paused adapter that misses its lease loses eligibility. On resumption it
  must fail its old attachment, with no renewal resurrection or automatic replay.
- Managed idle retirement, when wired after managed acquisition, uses 15 seconds
  with no eligible attachments and no queued, active or cleanup-retained work.
  Retirement fences admission before drain. Explicit manual residents continue
  to be stopped by their owner.

The 30-second lease leaves more than eight times the largest observed whole
parent lifetime; five-second renewal matches the existing control budget. This
margin is provisional. The calibration excludes full Huly acquisition, writes,
stalled target cleanup, suspended processes and native macOS. Windows resident
support is excluded by the 2026-10-18 user decision. TestClock
tests, lost-reply/paused/dead process fixtures, local Huly and final platform and
resource qualification remain required before accepting #326 or #328.
