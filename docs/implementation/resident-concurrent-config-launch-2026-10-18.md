# Concurrent incompatible configuration startup and fault isolation

Test-only increment after `40405f3c`; all six issues remain incomplete.

The configuration-fault contract now explicitly records sequential versus concurrent launch. Concurrent mode spawns both independent parent processes before awaiting either readiness event. Distinct effective REST endpoints must produce distinct managed backends in the same private namespace. The existing held-B request, backend-only A failure, same B generation/registry and exact B replies/owned retirement assertions then run unchanged.

The maintained matrix preserves both sequential fault modes for each protocol and adds concurrent/backend-only startup for each protocol: six cases in total. Concurrent startup is an explicit schedule, not proof that every internal filesystem/selection step overlapped. The two new cases passed in `/tmp/resident-config-concurrent-launch-first.log` (18.03 seconds) with all original request/startup/cleanup bounds intact. The six-case cohort passed in `/tmp/resident-config-launch-fault-six-cases.log` (50.00 seconds). Changed-file lint/format and both scoped source reviews pass. No full gate was run.

This run did not reproduce the earlier `discover` readiness failure recorded in the configuration-fault report. Its cause remains unknown; a passing schedule does not explain or erase it. No timeout was relaxed and no production synchronization/compatibility change was made. Broader launch kill boundaries, native macOS, lifecycle oracle and final qualification remain open.

Independent post-run inspection checked supervisor terminal0, sampled parent/adapter lineage and selective retirement in every root: the sole remaining generation record belongs to failed A; B’s generation record is absent. Roots:

- 2025-06-18 / backend-only / concurrent: `/tmp/resident-config-faults-epbv1C`
- 2025-06-18 / backend-only / sequential: `/tmp/resident-config-faults-yyLYaI`
- 2025-06-18 / adapter-backend / sequential: `/tmp/resident-config-faults-s9SBub`
- 2026-07-28 / backend-only / concurrent: `/tmp/resident-config-faults-LtyF9N`
- 2026-07-28 / backend-only / sequential: `/tmp/resident-config-faults-NFpv5e`
- 2026-07-28 / adapter-backend / sequential: `/tmp/resident-config-faults-wVpAHx`
