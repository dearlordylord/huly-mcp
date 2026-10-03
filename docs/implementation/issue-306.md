# Same-project destination movement (#306)

The supplied Dalph task body is GitHub #306, despite the immutable target identifying
#311. This candidate implements the supplied same-project slice against the
[authoritative parent #305](https://github.com/dearlordylord/huly-mcp/issues/305).
Cross-project execution and cross-project conflict resolution remain unavailable.

Immutable current attempt base: `b0d90d49886232c688751bde7fb3e38bd1cd5b3f`.
Complete-feature review base: `f072f3a2fbee27287097ed4c496e5c7c70bdbb1e`.

## Behavior

MCP `move_issue` and CLI `huly issues move ISSUE --destination JSON` share one
application operation. Issue and parent selectors accept complete identifiers or
stable IDs; project selectors accept identifiers or stable IDs. Destination forms:

```sh
huly issues move HULY-123 --destination '{"project":"HULY"}'
huly issues move HULY-123 --destination '{"parent":"HULY-42"}'
huly issues move HULY-123 --destination '{"project":"HULY","parent":"HULY-42"}'
huly issues move HULY-123 --destination '{"parent":null}'
```

Schema-owned snapshots feed hierarchy inspection. Discovery uses attachment edges,
not derived child counts. The operation checks source/destination ancestor chains,
parents arrays, direct child counts and descendant time/estimation entries. It
refuses incomplete discovery, missing ancestors, cycles, foreign-project children,
ambiguous/missing selectors and inconsistent no-ops before writes. Same-project
`resolutions`, even an empty array, are refused with instructions to omit them.

Execution updates only attachment edges and direct parent counts. IDs, identifiers,
workflow values, attributes, content and relation records are not rewritten.
Bounded verification checks destination, inspected tree membership/internal edges,
ancestry/counts/aggregates and child closure. Failures after sending a write are
`indeterminate`; observed inconsistent verification is `incomplete`. Neither
claims `changed:false`, retries execution, allocates numbers or rolls back.

Reads and writes do not provide global isolation. Another Huly client can edit
between an inspection and a write or after verification. The operation detects
observed changes; it does not certify every possible concurrent race.

## Ordinary-Huly trigger evidence

Live `http://host.docker.internal:8087/config.json` reported server `0.7.409`, model
`0.7.343` (Docker installation configured as `s0.7.409`). The empirical probe used
native REST TxOperations against this ordinary server, creating disposable issues
with estimation 2 and reportedTime 3, then deleting them.

A direct `updateDoc` changing root attachment updated root ancestry and its
old/new ancestor `childInfo` entry. It left descendant ancestry and membership
stale, and left direct child counts unchanged. After updating the descendant's
unchanged `attachedTo`, its ancestry and old/new `childInfo` membership were
correct. Arrays were immediate-parent first, then outward to the oldest ancestor.

Therefore the client sends attachment updates in breadth-first parent-before-child
order, including unchanged internal descendant edges to invoke the server's
ancestry and aggregate triggers. It adjusts old/new direct counts once. It never
writes `parents` or `childInfo` during movement and never duplicates server-owned
aggregate updates. The existing parent constructor now uses the observed ordering.

## Current recovery and validation cadence

Recovered complete retained chain `271468c9`, `a25550d6`, `1c1dcb97`,
`53e02d93`, `1654ff15` in order. `git diff 1654ff15 HEAD -- src packages scripts`
and `git diff b16cd48c HEAD -- src packages scripts` were empty before this
report update. Scoped historical live evidence therefore matches this production
candidate and its executable movement fixtures.

The user directs live Huly integration only after all six slices 306–311 are
integrated. Intermediate acceptance requires a fresh quality gate and fresh
reviews, and permits progression without certifying final live behavior. No live
suite was launched in this attempt.

Historical focused movement suite passed on ordinary server `0.7.409`, model
`0.7.343`; `/tmp/issue-306-final-movement.log` records MCP discovery/calls,
three-level preservation and actual ancestry/count/aggregate assertions, stable-ID
no-op and resolutions refusal, CLI destination forms and cycle refusal, and
fixture cleanup. The observed attachment trigger behavior is recorded above.
Historical `pnpm check-all` passed 342 files / 4810 tests, with statements 99.47%,
branches 99.00%, functions 99.01%, lines 99.56% in
`/tmp/issue-306-final-check-all.log`. These are historical results, not this
attempt's fresh gate result.

Final certification obligations remain: final integrated check-all, all authored
movement/transfer fixtures through MCP and CLI, whole-server MCP and full CLI
regression suites. The historical broad MCP run passed 1441 cases but had one
document-edit missing response; focused diagnostic passed 27 cases. This remains
an open final regression obligation. Historical broad CLI runs cannot certify
the final integrated candidate. The overseer owns long live suites.

## Fresh current attempt evidence

Fresh quality gate and separate Standards, Spec, and Dalph review results are
recorded below when complete.

### Standards

Fresh separate reviewer inspected immutable-base and complete-feature diffs,
AGENTS.md, review-rules and the full Fowler baseline: no reasonable blocking
findings. Schema-derived boundaries, typed failures, shared application rules,
strict queries and HulyClient injection seams conform; no blocking heuristic
smells identified.

### Spec

Fresh separate reviewer consulted fetched #305/#306 and supporting specifications:
no reasonable blocking implementation findings. Stable selectors, all destination
forms, prewrite refusals, consistent no-op inspection, narrowly scoped writes and
structured verification failures match the slice. The reviewer confirmed the
rewritten report resolves its stale evidence-status wording finding.

### Dalph review, round 1

Fresh reviewer using the inherited task model with medium reasoning inspected
both diffs, linked specifications, repository instructions, core/schema/adapters,
safety/property tests and executable fixture: no reasonable blocking findings.
The separate Standards and Spec reviews agree. No further review round required.

### Fresh quality gate

`pnpm check-all` completed with exit 0 in this attempt. All 342 test files and
4810 tests passed. Coverage: statements 99.47%, branches 99.00%, functions
99.01%, lines 99.56%. Build, TypeScript and Effect diagnostics, circular and
complexity checks, generated contracts/package checks, lint/format/duplication
and coverage gates passed. Successful output was 274/300 permitted lines.
Log: `/tmp/issue-306-current-check-all.log`; explicit exit record:
`/tmp/issue-306-current-check-all.exit` (0).
The first gate was interrupted before completion and supplies no pass evidence;
this result is the fresh restarted gate. Intermediate code acceptance is ready;
final integrated live certification remains pending as described above.
