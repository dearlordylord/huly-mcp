# Same-project destination movement (#306)

The supplied Dalph task body is GitHub #306, despite the immutable target identifying
#311. This candidate implements the supplied same-project slice against the
[authoritative parent #305](https://github.com/dearlordylord/huly-mcp/issues/305).
Cross-project execution and cross-project conflict resolution remain unavailable.

Base: `f072f3a2fbee27287097ed4c496e5c7c70bdbb1e`.

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

## Validation evidence

- Focused application/MCP/CLI tests: 47 tests passed, including generated tree invariants and observed concurrent tree changes.
- `scripts/integration_test_issue_movement.sh`: passed MCP discovery/calls and CLI
  executable calls on the ordinary local server. Six fixture issues included an
  old parent, moved root/child/grandchild, and destination parent/ancestor.
  The suite compared preserved SDK fields and relation results, immediate-first
  ancestry and exact old/new counts/aggregate entries. It tested stable selectors,
  explicit agreement, parent-only inference, both top-level forms, no-op,
  resolutions refusal and descendant refusal. Fixture cleanup ran.
- Full quality gate, final feature rerun and broader MCP/CLI suites: pending.

## Standards review

Round 1 at candidate `60da4b11`, against the immutable base: no reasonable blocking findings. The reviewer checked schema-owned boundaries, SDK queries, shared domain rules, dependency-injected tests, failure honesty, internal nonserialized types, resources and state minimality. No blocking Fowler heuristic findings. Pending validation was excluded from this code-standards assessment.

## Spec review

Pending immutable-base candidate review.
