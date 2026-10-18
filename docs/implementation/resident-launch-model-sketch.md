# Resident launch model type sketch

The maintained [type sketch](../../quint-specs/resident-launch.qnt) and
[scope note](../../quint-specs/resident-launch.md) supersede this document's
initial caller/child and guardian proposals. They distinguish adapters, native
backends, ownership claims, retirement evidence, leases and requests. Types and state declarations
only are proposed; no safety or liveness result is established.

[ADR 0003](../adr/0003-adopt-mcporter-resident-lifecycle.md) adopts the researched
MCPorter lifecycle practices and removes a mandatory guardian/restricted-worker
layer. Backend crashes may interrupt all callers; unresolved owner loss may
produce bounded refusal until verified local cleanup.

[ADR 0002](../adr/0002-resident-recovery-without-operation-journal.md) removes the
mandatory operation journal. Invocation history used to check no replay is
specification/oracle state, not persisted runtime data. Protected backend
ownership inventory remains a separate requirement. Model logic still awaits
explicit type-sketch approval. The authoritative contract remains GitHub #322
and #323 through #328, including their explicit uncertainty-scope amendment.


The 2026-10-18 type reconciliation links request and write history through invocation identity, separates colliding wire IDs, distinguishes remote effect truth from caller knowledge, and represents retained cleanup after terminal/cancellation. See the maintained scope note for details. This remains a type proposal awaiting the existing approval checkpoint; no executable lifecycle-model result is claimed.
