# Managed proxy policy modes

Test-only increment after `ee9be005`; all six issues remain incomplete.

The maintained managed-policy process fixture now enumerates native, proxy-strict and proxy-non-strict through the scenario schema. Native and strict proxy retain actual cross-policy call refusal checks. Non-strict proxy instead verifies its scoped native catalog and successful schema discovery for both its scoped tool and a cross-scope tool. This matches `protocol-tool-exposure.ts`: non-strict proxy candidates use the full registry, while scoped native tools remain visible. It does not claim a successful cross-scope Huly invocation or result validation.

The receipt distinguishes `call-refused` from `schema-visible` with a discriminated schema union, preventing contradictory scenario/evidence combinations. Every scenario still checks separate policy backend ports/registry records, context reads, kernel-owned backend exit0 and empty state.

The initial new case failed because the test incorrectly expected strict-only catalog semantics. The corrected matrix passed all three cases in `/tmp/resident-policy-three-modes-corrected.log` and `/tmp/resident-policy-three-modes-evidence.log`. Final union-schema validation passed all three cases in `/tmp/resident-policy-three-modes-union.log`. Changed-file Oxlint/format and both scoped reviews pass after correcting the receipt evidence representation. Earlier failure remains `/tmp/resident-policy-three-modes.log`. No production behavior was changed and no full gate was run. Native resource reads, successful Huly proxy operation results and broader host/platform qualification remain open.
