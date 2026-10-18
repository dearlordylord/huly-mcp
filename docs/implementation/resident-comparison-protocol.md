# Resident comparison protocol

Status: measurement preparation, not a benchmark result. Applies to #328 and
parent #322. Production candidate is `2f19c614`; report commits may advance
without changing the packaged MCP/CLI bytes. Recheck artifact hashes before
admitting each run. Do not mix samples from different artifacts.

The question is whether sharing one Huly backend reduces total process resources
for one and ten simultaneous clients, and what launch/read/shutdown cost a caller
observes. No expected numerical improvement or winner is assumed. A final claim
must name the tested client count, workload, cache boundary, completion rate,
median/range, resource accounting scope and independently observed limiter.

## Workload and ordering

Use the same immutable packaged MCP artifact, Node executable, local Huly
workspace, token authentication, native tool mode, full catalog and selected
existing project for all three modes. Never write Huly fixtures in this
comparison. Verify exact project identifier/name using the existing domain
schema on every successful read. Retain errors and timeouts as outcomes rather
than discarding runs or replacing them silently.

Use environment-selected authority for the direct shared HTTP server. Do not
send `x-huly-*` overrides: `createHttpClientLeaseResolver` deliberately builds a
new scoped client for an overridden request, whereas requests without those
headers use the shared process resolver. Comparing that request-scoped path
against managed sharing would change the intended cache boundary.

The modes are standalone stdio (one server process per client), managed stdio
(one adapter per client plus its shared backend), and direct shared HTTP (one
explicit HTTP server plus one HTTP session per client). Count every server and
adapter. Record client-driver and supervisor resources separately: these are
measurement overhead, not part of the product total. Preserve a whole-tree
upper observation as well so excluded overhead remains visible.

For each client count, run five rounds of all three modes. Rotate order:
standalone/managed/HTTP, managed/HTTP/standalone, HTTP/standalone/managed,
standalone/managed/HTTP, managed/HTTP/standalone. Each run owns fresh server
processes and a new private managed namespace. Start all clients within a round
from a common barrier and retain their individual start timestamps; do not call
staggered serial starts a ten-client launch race.

Use the same client implementation and modern protocol in every mode. Use the
actual listed tool definition with each SDK call to avoid repeated construction
of the entire catalog's validators by the driver. Discovery must still request
and validate the real full catalog and resource templates. Do not reduce the
server's tool inventory to make connections fit their existing deadlines.

## Phase boundaries

Retain monotonic start/end timestamps per client and phase, not just an aggregate:

1. Launch: start process creation or shared HTTP server creation. Record shared
   HTTP readiness separately and include it in end-to-end launch cost.
2. Connect/discovery: complete protocol negotiation, full tool listing and
   resource-template listing. Record each boundary separately.
3. Immediate first read: call `get_project` immediately after discovery and parse
   its actual result. This includes any lazy Huly connection/model initialization
   the production path performs. Do not label discovery alone model-ready.
4. Warm read: repeat the same validated read after the first result, without
   reconnecting. Count every response and retain any failure.
5. Delayed read: keep every session attached, wait a declared one second through
   the injected clock, then repeat the validated read on every client.
6. Shutdown: close each client, observe each owned adapter/server exit, and obtain
   kernel-correlated managed-backend retirement. Retain normal exit codes and
   private namespace inventory. Absence of a PID or listener is insufficient.

The first successful actual project read is the observable model-usable boundary.
A more precise model-load time requires separate diagnostic instrumentation and
must not be fabricated by subtracting unrelated timings. A later invocation
without the first read is a different workload and cannot enter these samples.

Keep existing five-second response, seven-second owned-exit and ordinary
25-second supervision bounds. One run is one bounded supervisor invocation;
the campaign may contain 30 such runs but does not enlarge an individual bound.
No lease-expiry extension applies to ordinary healthy shutdown. If the phases
cannot complete within these bounds, retain a failed run and diagnose before
admitting another equivalent run. All teardown paths retain kernel ownership
and run even after an earlier phase fails.

## Cache and resource accounting

“Fresh” means new product processes and new private resident state. It does not
mean flushed OS page cache, cleared Huly server caches or a new database. Do not
flush shared host caches. The first round may encounter warmer external state
than an earlier probe; rotating modes limits order bias but cannot erase it.
Warm/delayed reads reuse each run's client and Huly model in memory. Record
these boundaries next to results.

Use the maintained Linux `process_resources.py` observer at its existing 100 ms
interval and bounded inventory. Preserve raw samples, process start ticks,
parentage, clock ticks/second, page size, affinity, load and vanished-read count.
Correlate product roles with observed live ownership and stable process identity;
never classify an unrelated process by its name alone. Sum simultaneous product
RSS for each sample, then report the maximum of those sums and the samples at
phase boundaries. Adding each process's separate peak overstates simultaneous
RSS and is not the requested total. Summed RSS double-counts shared mappings;
it is neither physical memory nor PSS. Sampling can miss short-lived processes.

Report observed user+system CPU deltas by stable PID/start-tick identity. A
process missed before its last sample has incomplete CPU attribution; label it
accordingly. Kernel exit evidence proves retirement, not complete final CPU
accounting. Do not turn incomplete sampled CPU into an exact whole-run total.
Where attribution cannot be completed, report the gap and keep the corresponding
comparison inconclusive. Include process counts and driver CPU to detect a
saturated load generator.

Linux terminal CPU receipts can supplement those samples. The supervisor's
optional `--cpu-receipts <exclusive-private-file>` records `wait4` usage for each
child it actually reaps. The driver snapshots `/proc/self/stat` waited-child
user/system ticks after all directly owned product processes have exited. Add
those waited-child ticks to the CPU of product descendants separately adopted
and reaped by the supervisor. Correlate adopted PIDs with product roles/exits;
never add the driver's entire `wait4` subtree usage to its waited-child ticks,
which would double-count those children and include the driver itself.

Retain the driver's own CPU snapshot and whole-subtree kernel receipt as an
accounting cross-check. Waited-child ticks are quantized (10 ms on the observed
Linux host), and the driver snapshot precedes its last serialization/exit work.
Report the observed closure residual and rounding limitation; do not print a
tick-based product sum as microsecond-accurate. Missing exits, unknown adopted
processes or failed receipt recording leave the result incomplete. The
supervisor must continue joining owned processes even if receipt writing fails.
This method has control evidence for direct, nested and adopted children and one
managed MCP client; the alternating campaign still must exercise every mode and
client count.

## Admission, analysis and evidence

Before execution capture uptime, affinity/core count and competing CPU load.
The preparation observation on 2026-10-18 found load around 5–6 on 12 available
cores with active compiler/editor/agent processes. It is not a run baseline.
Do not stop another user's processes. Capture load for every actual run and
retain noise as a limitation. Do not run alongside a live movement campaign.

Use a separate untimed diagnostic to identify the limiting phase/process before
claiming a winner. Profiling/tracing runs are excluded from timed distributions.
Map observed work to the packaged runtime source. No limiter evidence, incomplete
work validation, or an untuned side means an inconclusive comparison.

Each private run directory must contain schema-owned inputs/results, source and
artifact hashes, role/PID/ownership records, raw phase/resource events, bounded
stdout/stderr, all exits and teardown evidence. Never retain credential values,
authorization headers or environment dumps. Produce a manifest only after run
and verifier completion; preserve failed attempts and verifier corrections.

The campaign report must show all 30 outcomes, five attempted samples per
mode/client-count cell, completion/timeout/error counts, per-phase medians and
ranges, simultaneous RSS observations, CPU attribution limits and the untimed
limiter diagnostic. Failed attempts stay in the denominator. A passing subset
cannot certify the full comparison or the complete resident delivery.
