# Resident launch model type sketch

The maintained [type sketch](../../quint-specs/resident-launch.qnt) and
[scope note](../../quint-specs/resident-launch.md) supersede this document's
initial caller/child proposal. They distinguish adapters, guardians, restricted
workers, ownership claims, leases and requests. Types and state declarations
only are proposed; no safety or liveness result is established.

[ADR 0002](../adr/0002-resident-recovery-without-operation-journal.md) removes the
mandatory operation journal. Invocation history used to check no replay is
specification/oracle state, not persisted runtime data. Protected backend
ownership inventory remains a separate requirement. Model logic still awaits
explicit type-sketch approval. The authoritative contract remains GitHub #322
and #323 through #328, including their explicit uncertainty-scope amendment.
