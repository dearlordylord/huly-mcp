# Shared model waiters across controlled idle intervals

The existing model-wait process fixture now has four additional clock-controlled
cases: both supported protocols, cancelling either the acquisition creator or
its joiner. The original four fully packaged, physical-clock cases remain.

The additional cases use a separately owned production-configured backend with
TestClock and the real application registry/Huly SDK against disposable REST.
Both independent parents own actual packaged managed adapters. Their project
calls wait on one held full-model response; status must retain both requests
across4900ms plus5000ms advancement, with no project query yet dispatched.

After one caller acknowledges cancellation and its request cleanup completes,
another5000ms advance must retain only the survivor on the same accepting
generation. Model requests remain1 and project reads0. Releasing the model must
produce exact SURVIVE, FRESH and continued SURVIVE results, with one acquisition,
three filtered reads, no writes/invalid requests and byte-identical registry.
Both parents close0. Another4900ms must preserve the generation;100ms more must
produce actual owned backend close0 and empty state.

For controlled cases the backend is a direct child, so its exit observation is
constructed only after checking that exact child's PID and actual close0/no
signal. Original fully packaged cases retain the independent kernel-reaped exit
path. The receipt explicitly records `clockControlled`; historical receipts
belong to their source revision rather than a compatibility parser.

The shared idle-clock process helper now serves this scenario and the existing
attachment-first test. Callers parse environment through `LiveProbeEnvironment`,
the helper retains redacted values and unwraps only for spawn. This correction
came from Standards review. Primary failures retain precedence over independent
parent/REST/backend cleanup. Existing5s observations,7s backend exits and25s
supervision remain intact.

Evidence:

- `/tmp/resident-model-wait-idle-matrix.log`: both focused files, all9cases pass
  48.32s before the environment-boundary correction.
- `/tmp/resident-model-wait-idle-redacted-final.log`: all five affected clock
  cases pass15.13s after correction; the four unaffected physical cases are
  intentionally filtered, not silently counted as rerun.
- Final clock roots: modern creator`/tmp/resident-model-wait-pWCtt9`, modern
  joiner`/tmp/resident-model-wait-D2xLDw`, legacy creator`/tmp/resident-model-wait-vRwZbC`,
  legacy joiner`/tmp/resident-model-wait-zo9ASk`. Each receipt independently
  inspected: retained counts2/1/0, model1, exact three query identifiers and exit0.
  Each resource log ends with supervisor terminal0; phase logs contain every
  acknowledged clock advance.

The first lint finding (destructuring order) is retained in
`/tmp/resident-model-wait-idle-first.log`; corrected first case passes in
`/tmp/resident-model-wait-idle-corrected.log`. TypeScript and changed-file checks
pass; both scoped reviews accepted the final correction.

This is actual SDK model waiting over disposable REST with real packaged
adapters. It is not native Huly certification, a physical timeout measurement,
all new-call/completion orders at the fence or native macOS evidence. No
production code, journal, legacy path or full campaign changed. All six issues
remain incomplete.
