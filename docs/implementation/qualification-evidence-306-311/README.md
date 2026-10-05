# Qualification orchestration archive

Source checkpoint: `96204ed887b5ef087d5215e348ca070233bc7d84`.

These text snapshots preserve the private orchestration helpers and their exact
source hashes. The integration implementation is stored in the same branch base.
The helpers contain machine-specific paths; restore their original names and
local resource layout before reproducing an attempt. They are archival evidence,
not additional package entrypoints.

The actual full quality gate passed on `77f66d09`. Its result remains attributed
to that commit. A read-only historical input projection reproduced its exact
source and runtime aggregate bindings against the current built files. Source
transition inventory: `3a46d866b32483e5b30e639940b7e4f4aadfe4f7446abf3db5b0c78bfd546f85`.
Both Standards and Spec reviews passed that inventory.

Twelve historical concurrency cases have completed domain assertions. The first
selected continuation stopped during setup due to the selector entering native
prior identity; `96204ed8` fixes that propagation with an offline regression.
The successor live qualification is still running. This archive does not claim
completion of the six remaining cases, all five suites, or the 71 criteria.
