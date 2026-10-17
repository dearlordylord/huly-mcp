# Ten stdio processes versus shared HTTP

Read-only local-Huly comparison on source `9e8ed80b4d4d564cd89b17aca2ab52ad8a1a2f06`, MCP **0.54.0**, Node **24.14.0**, Darwin arm64, 12 logical CPUs, 96GiB RAM. Exact shipped MCP artifact SHA256 `95bb2826e50607159f10241650be38341b54e06de18777f8fd7466614d9c4cac`. No production source, transport default, global Codex configuration or credentials were changed.

**For ten clients using one Huly identity, a shared environment-backed HTTP daemon materially reduces startup work and summed server RSS in this experiment.** A single client gains little. Request-isolated credential-header HTTP retains repeated full-model acquisition costs and should not be treated as the same sharing configuration.

## Method and admission

[Raw numerical results and method](transport-comparison.json) retain all 18 qualified fleets: three trials × one/ten clients × stdio/environment HTTP/header HTTP. All **18/18 fleets and 99/99 logical clients pass**, no RPC timeout, exact catalog/project/provider/resource parity, cleanup confirmed. Stdio uses 33 server processes; the 12 HTTP fleets use one daemon each, for **45 fresh server processes** total. Trial order reverses in the middle repeat. Three small repeats are descriptive, not an SLA or a tail-reliability guarantee; earlier failed high-concurrency experiments are not erased by this pass.

Each client uses the same SDK2.0.0, six proxy tools and pinned2026-07-28 protocol, validating tool outputs. The SDK stdio transport is subclassed only to keep discovery probing in the same process instead of spawning its default disposable negotiation sibling. HTTP uses the stock StreamableHTTPClientTransport and ten separate SDK Client objects. Modern HTTP requests are stateless; ten clients mean ten concurrent logical request streams, not ten durable server-side sessions.

Each fresh fleet performs discovery, tools listing, project listing, model-dependent notification-provider listing, resource enumeration and two repeat project/provider pairs. All target operations are reads; no fixture writes or message sends. Exact payload equality is checked in memory; only hashes/counts/timings are published. HTTP environment mode shares one configuration and process-owned Huly client; header mode removes Huly configuration from the daemon environment and supplies the same identity in per-request headers. It deliberately measures isolated acquisition, without inventing pooling across credentials.

Time starts before daemon/process launch, so HTTP listener/bootstrap time is included. HTTP waits for its application-ready stderr event before clients connect; no extra fixed readiness sleep or warm-up Huly read is excluded. Filesystem and backend caches are warm. Host load averages are retained per fleet. This is synthetic SDK/server performance, not Codex desktop UI startup or a benchmark of model reasoning/network/package downloads.

## Results

All times are milliseconds, medians over three fleets. Catalog/projects/model readiness is the slowest client completion from fleet launch. Whole scenario includes both warm repeat pairs. Warm-model time is the median per fleet, then median across fleets. CPU is summed server-process CPU seconds for the whole scenario; it excludes the benchmark client and Huly backend.

| Clients | Transport/configuration | Catalog | First projects | Model-dependent ready | Whole scenario | Post-read summed RSS, GiB | Server CPU, s | Warm model call, ms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | stdio | 568 | 697 | 1996 | 2148 | 0.56 | 2.08 | 3.6 |
| 1 | http-env | 576 | 711 | 1945 | 2095 | 0.56 | 2.06 | 3.7 |
| 1 | http-headers | 515 | 645 | 1959 | 5022 | 0.71 | 4.06 | 1364.4 |
| 10 | stdio | 2337 | 3237 | 8829 | 9140 | 5.06 | 24.45 | 5.7 |
| 10 | http-env | 1274 | 1458 | 2893 | 3141 | 0.57 | 2.79 | 10.0 |
| 10 | http-headers | 780 | 977 | 11168 | 35953 | 0.85 | 32.30 | 8420.6 |

RSS is the sum reported by `ps` after reads, not physical/PSS memory; shared pages can be double-counted across processes. Sampled maximum summed RSS is retained in raw data, sampled every500ms; it is not a proven instantaneous peak or idle footprint. Sampling launches one `ps` per owned PID and adds observer overhead, especially for stdio. No memory cap, CPU allocation, timeout or output contract was changed. Within a fleet, each client runs sequentially while clients run concurrently; this is not a sustained-throughput/RPS study.

## Pilot failures and readiness boundary

A preliminary TCP-port-only readiness probe admitted HTTP requests before application readiness and produced20-second handshake timeouts with both legacy and modern SDK negotiation. Direct modern POST against application-ready HTTP succeeded, including a string request ID; the same modern SDK path succeeded after switching only readiness admission to the application-listening event. The failed pilot logs remain private; they are excluded from qualified performance statistics and are not diagnosed as a protocol compatibility regression. Their precise internal socket/route race is not established. The qualified matrix uses application readiness consistently and includes its elapsed time.

## Recommendation

Offer a separately managed, shared environment-backed HTTP daemon for multiple concurrent agent sessions that intentionally use the same Huly identity. Retain stdio as a convenient default for a single session until daemon start/stop, restart discovery, endpoint ownership and credential policy are deliberately chosen. The experiment does not install a service or silently alter the host.

HTTP header mode remains useful for credential isolation. Its model-dependent requests repeatedly initialize their own clients; a repeat call is not warm merely because it reaches the same HTTP process. Do not pool different credentials/workspaces to reproduce environment-mode timings.

This resolves the performance-study question, not the outstanding [release qualification failures](RELEASE-QUALIFICATION.md). Current movement verification, native stdio attachment expectation and HTTP-header attachment response remain unresolved. Broader model-light paths, cold-disk startup, actual multi-thread Codex lifecycle and sustained load remain separate questions. Temporary probe executables are removed after retaining data/provenance.

Existing implementations and lifecycle pitfalls for preserving stdio through a shared backend are surveyed in [resident-daemon research](RESIDENT-DAEMON-RESEARCH.md). That survey does not change the measured transport configuration or implement an automatic daemon.
