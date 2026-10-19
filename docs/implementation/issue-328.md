# Issue 328 qualification evidence

## Current Linux resource comparison — criteria 6 and 7

The current immutable MCP artifact is
`33311217d91ac0938123173ea9d555939fe9321edbf6f763b4d67c0e404a5d4f`.
The campaign source is `b9bf3dcae9f136ef94d391cf0ef80b03a341e2f1`; production
runtime sources remain unchanged from `0db836c2`. Retained inputs and results are
in `/tmp/resident-comparison-333-pf2nt6b8`. Earlier cbdc-artifact measurements
are excluded.

All 30 rotating fresh-process attempts ran: five per mode and client count.
Twenty-five completed and five failed; none were unexecuted. Every failed
attempt was the ten-client standalone control. All ten clients received the
606-tool and three-resource-template inventory, but 37 clients across those five attempts
timed out at their first business read. Failed attempts completed respectively
6, 6, 9, 6 and 12 reads. Overall, 384 of 495 planned reads completed.

Each failed attempt retains its result and exact first-read timeout records.
All ten owned servers exited 0, the driver was kernel-waited with exit 1,
private state was empty and cleanup failures were zero. Before admitting the
next scheduled case, the coordinator checked a case-specific assessment and its
hashed cleanup evidence. No failed case was retried. The frozen 900-second
admission window and individual deadlines were unchanged. The analyzer found
no admission deviations. An analysis/admission control suite passed 12 local
checks before freezing; independent Spec review checked the actual arithmetic,
workload results, cleanup and continuation binding.

The comparison is descriptive. It does not establish a universal winner or a
unique cause for the failed standalone workload. Failed partial work does not
enter equal-work CPU/RSS distributions.

| Mode | Clients | Completed / attempted | Product RSS MiB, median [range] | Product CPU seconds, median [range] | Launch to first reads ms, median [range] |
| --- | ---: | ---: | ---: | ---: | ---: |
| Standalone stdio | 1 | 5 / 5 | 532 [527–534] | 2.60 [2.53–2.97] | 2887 [2316–2935] |
| Managed stdio | 1 | 5 / 5 | 677 [672–679] | 3.31 [2.83–3.50] | 3487 [2704–3595] |
| Direct shared HTTP | 1 | 5 / 5 | 531 [530–541] | 2.61 [2.38–3.02] | 2515 [2367–3129] |
| Standalone stdio | 10 | 0 / 5 | No complete-work sample | No complete-work sample | No complete-work sample |
| Managed stdio | 10 | 5 / 5 | 2002 [1962–2028] | 10.68 [8.70–15.06] | 4749 [3578–6879] |
| Direct shared HTTP | 10 | 5 / 5 | 551 [547–554] | 4.01 [3.77–4.74] | 3582 [3561–4294] |

RSS is the maximum observed simultaneous sum over product processes sampled
at 100 ms. It includes every server, adapter and observed auxiliary descendant;
it is not PSS, unique physical memory or an exact peak. Driver and supervisor
are excluded. Product CPU combines waited direct children with separately
kernel-reaped adopted backends. Raw receipts retain 10 ms waited-child tick
resolution and closure residuals; these are not microsecond-accurate totals.
For one client, the managed product includes both adapter and backend; for ten,
it includes ten adapters and one backend. The direct HTTP product includes
one server and no stdio adapters.

`analysis.json` retains all raw samples, medians, ranges, completion counts and
read denominators. `phase-analysis.json` additionally summarizes connect,
catalog, resource-template listing, immediate, warm and delayed calls, with one slowest-client
sample per completed attempt. The one-second delay precedes the delayed call
and is excluded from its call duration. Successful first read is an upper
boundary including model acquisition and the business operation, rather than an
isolated model-load measurement. External Huly and OS caches were not reset.
Load was recorded for every admission; this shared host had competing work.

Managed shutdown includes the production five-second idle retirement: its
median was 5044 ms for one client and 5093 ms for ten. Standalone/direct HTTP
use their normal owned close/stop paths. Those distinct lifecycle policies are
part of the declared workload, not adjusted to equalize results.

## Independent diagnostic and retained limits

After the timed schedule, an independent ten-standalone CPU-profile diagnostic
used the same artifact, workload and bounds. Profiling perturbs execution and
its samples are excluded from every comparison distribution. Nine first reads
timed out; all ten servers exited 0 and owned cleanup completed.
`untimed-profile-file-input/analysis.json` summarizes ten V8 profiles. The
largest named userland self-sampling hotspot was SDK `extractJson` (9459 of
55114 total samples; idle and GC samples remain separately visible). That
routine decodes REST JSON and optional Snappy data; SDK `getModel` uses it and
`src/huly/client.ts` requests the full model before business reads. Async stacks
do not identify which response produced every sample. This supports a decoding
cost hypothesis, not a unique causal explanation or an isolated model duration.
Sample counts are not exact CPU durations.

The first untimed invocation incorrectly supplied JSON where the harness expects
an input-file path. It failed before launching a product process; its records
remain under `untimed-profile`. The corrected invocation has a separate evidence
directory and is not a retried timed sample.

`terminal-manifest.json` hashes 920 retained files, rechecks all 56 frozen inputs
and 613 transitive source/toolchain/external-runtime dependencies, and records
all attempts and the unchanged campaign stop time. `secret-scan.json` found no
matches for the two actual configured secret values in 919 scanned files.
No live mutation or recipient messaging was performed.

The preceding coherent d9ed quality gate failed at the unchanged 300-second
test/coverage limit. These measurements do not replace it. Final delivery,
remaining relevant integration and prototype retirement remain incomplete.
Native macOS execution is optional and user-deferred by the #322/#328 amendment;
it remains unexecuted and is not qualified by Linux evidence.
