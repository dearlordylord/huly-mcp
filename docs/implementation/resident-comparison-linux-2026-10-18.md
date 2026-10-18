# Resident Linux comparison — 2026-10-18

Scope: packaged production candidate `2f19c614`, source HEAD `b1415354`.
MCP SHA-256: `908e121f7d9fd4ab49b931b1ee349a448feec5a6db10d616ac3b0267dfe47416`.
Node v24.20.0, Linux aarch64, 12 available CPUs; other host activity remained present.
This is a read-only local-Huly workload, not a general performance budget or full delivery qualification.

All 30 scheduled attempts ran once: 28 verified, two failed, zero unexecuted.
No failed attempt was replaced. Every one-client cell passed 5/5; ten-client standalone passed 3/5, managed and shared HTTP each passed 5/5.

## Workload and accounting

See [protocol](resident-comparison-protocol.md). Each attempt uses fresh product processes, modern SDK protocol, all606 tools/3 resource templates and immediate/warm/one-second-delayed reads of one exact existing project per client. A common Deferred barrier releases the client starts; individual timestamps remain in the raw record. External OS/Huly caches were not flushed. HTTP uses environment authority, without per-request authority overrides. Five rounds rotate mode order. No Huly writes occur.

CPU is product waited-child ticks plus separately adopted backend kernel wait4 usage, excluding driver/supervisor and avoiding double counting. RSS is the maximum simultaneous sum across every observed product descendant, sampled every100ms. It includes extra startup descendants; it double-counts shared mappings and is neither physical memory nor PSS. Short-lived descendants may escape sampling. CPU tick resolution is10ms. Whole-driver-subtree/own-driver closure checks pass for all28 complete attempts; failed attempts have incomplete attribution and are excluded from resource distributions.

Resource medians and ranges below are for verified complete attempts only. Failure rates and partial reads stay explicit; survivor-only distributions cannot establish the expected cost of a successful ten-client standalone deployment.

| Mode | Clients | Verified/attempted | Correct reads/planned | Read timeouts | Other recorded errors | Product CPU seconds median [min,max] | Sampled peak summed RSS MiB median [min,max] |
|---|---:|---:|---:|---:|---:|---|---|
| standalone | 1 | 5/5 | 15/15 | 0 | 0 | 2.28 [2.26, 2.30] | 544.93 [543.23, 547.73] |
| managed | 1 | 5/5 | 15/15 | 0 | 0 | 2.78 [2.72, 2.95] | 695.67 [694.87, 706.16] |
| http | 1 | 5/5 | 15/15 | 0 | 0 | 2.29 [2.24, 2.68] | 549.61 [547.04, 552.82] |
| standalone | 10 | 3/5 | 141/150 | 3 | 2 | 31.40 [31.22, 32.00] | 5382.60 [5381.64, 5385.08] |
| managed | 10 | 5/5 | 150/150 | 0 | 0 | 9.55 [8.38, 10.71] | 2093.50 [2074.24, 2309.82] |
| http | 10 | 5/5 | 150/150 | 0 | 0 | 3.48 [3.46, 3.52] | 558.33 [554.10, 560.00] |

## Phase observations

Milliseconds: median [min,max] of per-client observations from verified attempts. The ten client values within an attempt are correlated; their pooled count is not five independent repetitions per client. Shutdown is one observation per verified attempt. Launch-to-first-read includes shared HTTP startup; connect alone does not. Failed read deadlines are reported separately, not inserted as successful durations.

| Mode/clients | Connect | Full catalog | Resources | Immediate read | Warm read | Delayed read | Launch to first read | Shutdown |
|---|---|---|---|---|---|---|---|---|
| standalone-1 | 782.65 [761.83, 809.79] | 165.27 [145.93, 182.37] | 2.98 [2.86, 4.15] | 1315.57 [1290.72, 1555.76] | 55.16 [51.23, 57.62] | 50.12 [47.22, 58.28] | 2289.99 [2212.15, 2540.86] | 25.29 [21.67, 37.56] |
| managed-1 | 1114.57 [1056.53, 1319.32] | 233.25 [213.13, 286.96] | 8.79 [6.85, 10.51] | 1315.40 [1277.93, 1367.29] | 54.15 [47.87, 58.08] | 59.59 [54.92, 67.76] | 2702.55 [2656.27, 2834.79] | 5041.30 [5033.89, 5058.71] |
| http-1 | 49.93 [35.33, 54.16] | 162.02 [143.29, 193.22] | 6.24 [5.47, 9.00] | 1335.24 [1246.83, 1376.60] | 57.26 [48.71, 62.82] | 62.05 [58.59, 65.29] | 2370.93 [2239.60, 2722.82] | 18.25 [16.40, 20.38] |
| standalone-10 | 1682.34 [1513.11, 2717.59] | 391.78 [157.84, 591.90] | 12.18 [2.36, 86.75] | 3904.28 [2636.51, 4386.64] | 57.80 [34.43, 413.60] | 55.60 [44.23, 93.95] | 6196.54 [4500.14, 6481.48] | 63.45 [63.38, 63.82] |
| managed-10 | 2463.67 [1310.33, 4049.54] | 306.78 [188.14, 1033.35] | 52.69 [5.69, 816.40] | 1254.69 [56.84, 2148.46] | 68.98 [46.29, 81.78] | 61.04 [48.66, 77.56] | 4181.37 [3379.65, 5087.40] | 5075.56 [5060.63, 5088.35] |
| http-10 | 69.84 [51.92, 79.85] | 745.48 [159.33, 1139.74] | 191.79 [16.44, 832.70] | 1344.80 [1225.29, 2007.96] | 63.67 [43.64, 92.99] | 60.92 [37.71, 120.66] | 3217.22 [3140.37, 3355.45] | 25.74 [19.04, 40.53] |

## All outcomes

| Case | Supervisor | Verifier | Outcome |
|---|---:|---:|---|
| 001-standalone-1-round-1 | 0 | 0 | verified |
| 002-managed-1-round-1 | 0 | 0 | verified |
| 003-http-1-round-1 | 0 | 0 | verified |
| 004-managed-1-round-2 | 0 | 0 | verified |
| 005-http-1-round-2 | 0 | 0 | verified |
| 006-standalone-1-round-2 | 0 | 0 | verified |
| 007-http-1-round-3 | 0 | 0 | verified |
| 008-standalone-1-round-3 | 0 | 0 | verified |
| 009-managed-1-round-3 | 0 | 0 | verified |
| 010-standalone-1-round-4 | 0 | 0 | verified |
| 011-managed-1-round-4 | 0 | 0 | verified |
| 012-http-1-round-4 | 0 | 0 | verified |
| 013-managed-1-round-5 | 0 | 0 | verified |
| 014-http-1-round-5 | 0 | 0 | verified |
| 015-standalone-1-round-5 | 0 | 0 | verified |
| 016-standalone-10-round-1 | 1 | not run | failed |
| 017-managed-10-round-1 | 0 | 0 | verified |
| 018-http-10-round-1 | 0 | 0 | verified |
| 019-managed-10-round-2 | 0 | 0 | verified |
| 020-http-10-round-2 | 0 | 0 | verified |
| 021-standalone-10-round-2 | 1 | not run | failed |
| 022-http-10-round-3 | 0 | 0 | verified |
| 023-standalone-10-round-3 | 0 | 0 | verified |
| 024-managed-10-round-3 | 0 | 0 | verified |
| 025-standalone-10-round-4 | 0 | 0 | verified |
| 026-managed-10-round-4 | 0 | 0 | verified |
| 027-http-10-round-4 | 0 | 0 | verified |
| 028-managed-10-round-5 | 0 | 0 | verified |
| 029-http-10-round-5 | 0 | 0 | verified |
| 030-standalone-10-round-5 | 0 | 0 | verified |

## Preserved failures and limits

Case016:27/30 exact reads, one immediate REQUEST_TIMEOUT, one close TimeoutError, nine normal product exits. Case021:24/30 exact reads, two immediate REQUEST_TIMEOUTs, one close TimeoutError, nine normal product exits. All clients in both cases completed606-tool/3-template discovery. The25-second supervisor killed and kernel-joined each remaining server and driver; these are forced cleanup outcomes, not normal shutdown passes. Product stderr in016 reports process-scoped Huly client cleanup timed out. The cause of the stalled first reads is unproven. Later standalone cases023/025/030 passed; failures were not universal. The unchanged five-second response/seven-second exit/25-second supervisor limits remained enforced.

Named boundary diagnostics: `/tmp/resident-comparison-case016-diagnostic-ki5e3aql` and `/tmp/resident-comparison-case021-diagnostic-1cjmed0y`. Continuation admitted only the unexecuted suffix, preserving failed cases. Controller sessions11919,57738 and28597 are terminal; the final exit1 correctly retains the two failures even after all30 attempts complete.

Untimed one- and ten-client owner profiles are outside these distributions. They show model JSON extraction/tree traversal, GC and substantial idle samples; they do not establish one stable limiter. Therefore no general winner, tuned comparison, durable budget or latency guarantee is established. The observed resource values apply only to this artifact/workload/host and successful attempts. No inference about native macOS or Windows follows.

Private raw root: `/tmp/resident-comparison-campaign-v3-pi0hult3`; `terminal-manifest.json` freezes 1015 files, including inputs, all outcomes, product/driver exits, resource/phase traces, wait4 receipts, verification and preserved controls. `final-analysis.json` and rerunnable `analyze-campaign.py` are retained in the016 diagnostic root with `analysis-manifest.json`. Raw exact project identifiers/names remain private; this report includes none. A maintained portable campaign tool and independent final review remain pending. All six implementation tickets remain incomplete.
