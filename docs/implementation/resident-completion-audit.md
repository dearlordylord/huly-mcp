# Resident completion audit — 2026-10-18

Candidate: `b3e28661`. All seven current GitHub issue bodies (#322–328) matched
the cached specifications. Their SHA-256 values and the full candidate commit
are recorded in [the audit data](resident-completion-audit.json).

The inventory covers 50 parent stories, 52 additional normative implementation
and testing clauses, and 68 child acceptance criteria: 170 rows. These overlap;
counts are neither independent features nor a completion percentage.

| Group | Proven | Partial | Unverified | Deferred |
| --- | ---: | ---: | ---: | ---: |
| Parent stories | 30 | 18 | 2 | 0 |
| Parent implementation/testing clauses | 21 | 30 | 0 | 1 |
| Child criteria | 28 | 38 | 0 | 2 |

Each row retains the exact requirement, evidence locations and its concrete gap.
“Proven” applies to that row's scope; it does not substitute Linux results for
native macOS or turn a component test into a packaged process scenario. Broader
claims remain incomplete. No issue is ready for closure.

## Concrete remaining work

1. **Operational status:** current `resident status` is a protected filesystem
   snapshot with unverified liveness. It lacks authenticated admission/readiness,
   model state, attachment/request counts and drain state required by parent
   clause D36. This is a behavior gap, not merely a missing receipt.
2. **Held shared-model and active-call isolation:** component tests and ordinary
   live survivor reads exist, but the complete packaged two-parent held-model
   wait/cancel/survivor/no-late-dispatch schedule remains missing. Complete
   queued/active work, slow-host/backpressure and idle boundary schedules also
   need stronger real-process evidence.
3. **Identity and routing matrix:** name-driven modern/legacy and actual-host
   auto reads pass. Remaining gaps include credential-generation/native-store
   invalidation, capability/interactive/progress routing and old-generation
   interference with a replacement using colliding IDs.
4. **Unexpected-loss recovery evidence:** bounded refusal with retained ownership
   is valid. Normal verified retirement and concurrent replacement are proven.
   The pre-Start parent-death case retains a claim; usable startup after verified
   unexpected-loss retirement/reset is not yet demonstrated or operationally
   documented. A particular new CLI command is not inferred as mandatory.
5. **Transition structure, formal and native qualification:**
   Start/lease/response pure functions exist, but admission, idle and ownership
   decisions still mix with mutable Effect sequencing; the general explicit-event
   pure transition boundary is incomplete. The lifecycle Quint file is types-only;
   required transitions/invariants/fairness/oracle alignment are missing. Native
   macOS process/permission evidence is missing. Existing Linux/subdomain model
   results cannot replace either requirement.
6. **Delivery:** operational guidance and portable published evidence need final
   qualification. Prototype/artifact/branch retirement remains deferred until
   production integration and qualification. Windows implementation is excluded;
   safe unsupported startup refusal remains required and has evidence.

The completed 30-attempt comparison and actual Claude/Codex auto read campaigns
are credited. They need not be repeated merely because unrelated rows remain
partial. Their explicit failures and limits remain in the linked issue reports.

## Recheck the audit

Run from the checkout with a directory containing the frozen GitHub JSON bodies
`322.json` through `328.json` (each has a body field):

```bash
python3 scripts/verify-resident-completion-audit.py \
  --requirements-dir /tmp/resident-completion-audit-1eqbwb97/requirements \
  --audit docs/implementation/resident-completion-audit.json
```

The checker rejects issue-body drift, omitted/duplicate IDs, changed requirement
text, unsupported statuses, unreferenced “proven” claims, missing evidence files,
out-of-range cited lines and changed content in all 163 cited files. Repository evidence uses relative paths; private
receipts retain absolute paths. Missing receipts on another machine cause a
failure, not an assumed pass. Issue bodies can be retrieved with
`gh issue view NUMBER --json body`; changed bodies require a new audited snapshot.

The default success means inventory consistency and artifact availability only.
It cannot assess whether a cited test actually proves a requirement. Reviewers
must inspect the claim, assertion and receipt scope. `--require-complete` also
requires every row to be proven and currently exits1. `--inventory` emits the
canonical inventory; `--self-test` checks two valid inventories and eight invalid audit
cases without running the product or changing state.

The retained audit root contains current issue metadata, independent parent and
child reviews, the root review of normative clauses, and checker output. Both
review reports remain evidence inputs rather than completion authority. No MCP
runtime, transport default, service, ownership storage or Huly data changes are
introduced by this audit.
