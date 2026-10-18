# Resident operational status — Linux, 2026-10-18

Parent #322 clause D36 requires redacted generation, readiness/admission,
attachment/request counts, drain and blocked-recovery observations. The earlier
filesystem-only status did not satisfy that clause.

`huly resident status` now reads each recognized protected generation's status
through its existing TLS/bearer channel. The endpoint does not admit an adapter,
acquire a Huly client, mutate ownership or replay operations. Readiness means MCP
application readiness. Request counts include work retained for cleanup; failed
cleanup and overdue drains with outstanding resources remain visible as blocked.
The work projection is a pure function of owner observations.

Package-version differences alone do not block observation: CLI and MCP versions
are independent. The status descriptor must match the protected envelope and
publication, including generation and implementation version, and the response
must match the versioned status wire and selected generation. Managed attachment
selection still requires exact MCP implementation compatibility. Unknown
descriptor formats remain opaque. Unsupported, invalid, oversized, unavailable
or mismatched responses leave recovery unverified.

Each status request has a five-second bound and a 4 KiB response limit, without
retry. At most the existing 16 inventory records are probed concurrently.
Credential values, endpoints, private fingerprints and response payload extras
are omitted from output. A live reply reports retirement as `unconfirmed`;
neither that reply nor filesystem absence authorizes ownership reset.

## Evidence

Retained root: `/tmp/resident-status-qualified-ai0bo0be`.

- Component tests exercise startup/readiness, admission fencing, pending
  admission, retained and failed cleanup, authorization, method refusal, invalid
  response/schema/generation, body limits, private-field omission and a held
  response timeout using `TestClock`.
- The packaged managed operator-stop fixture invokes the actual CLI against
  two independent adapters, then one survivor, and records counts 2 → 1 for the
  same generation. It also preserves its original unrelated-generation,
  stop/retirement and replacement assertions. The successful focused run is
  `/tmp/resident-status-cross-version.log` (19 tests across three files).
- A read-only local-Huly pair performed four project reads through a shared
  backend, with separate parent/adapter PIDs. A concurrent actual CLI observation
  authenticated the same generation, reporting two attachments and two retained
  requests. This is one point-in-time observation, not a controlled held-call
  cancellation or full concurrency matrix.
- `live-exits.json` records CLI and supervisor exit0. The pair receipt separately
  confirms backend exit0 and empty state. `verify-live.mts` parses input, status
  and receipt through their Effect Schemas, and checks targets, identity and
  retirement. No Huly writes were performed.

The first process runs and first full gate failed because status reused exact
MCP-version attachment selection; both logs and owned fixture directories were
retained. A later gate caught one unnamed numeric test constant. A timeout test
initially held its fixture HTTP response through server shutdown; releasing that
fixture response after the timeout assertion fixed test cleanup without changing
the product timeout. A subsequent full run exposed a pre-existing stop test whose
message assertion assumed the later refusal path: protected descriptor mismatch
is now refused earlier. Its typed refusal and zero-submission checks remain;
the same no-submission phrase is compared without case sensitivity. Final
`pnpm check-all` passed: 492 files / 5767 tests; 1389 TypeScript/Effect files
with zero errors or warnings. Coverage is 99.45% statements, 99% branches,
99.01% functions and 99.55% lines, with 200/300 successful output lines.
Log: `/tmp/resident-status-check-all-complete.log`, SHA-256 `11a03a3888f647112d4fc3f21f843f89610a061045bb4d527b23540697479965`.
Both scoped source/evidence reviews found no remaining actionable findings.

This increment does not complete #323–328. Native macOS, broader lifecycle and
protocol schedules, lifecycle model/oracle work and final delivery qualification
remain separate requirements. Earlier live movement receipts bind older runtime
artifacts and are not recertification of these changed bytes.
