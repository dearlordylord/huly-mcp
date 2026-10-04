# Issue 308: preserve task-owned records

Candidate implementation extends the shared MCP/CLI compatible-leaf transfer. It is independently usable without issue 309: cross-project descendants and nonempty component/milestone references still refuse before allocation. Attribute resolution and tree support remain owned by their respective slices.

## Model and ownership evidence

Installed Huly SDK declarations define the parsed payload contracts. Ordinary platform reference source is pinned at `2a985b31e314c0793dd965e5a1d8abe28f262f34` in `.reference/platform_fork`; this source is research evidence, not certification of the local Docker server.

- `models/task/src/index.ts`: inherited comments, attachments and task labels; `models/tracker/src/types.ts`: labels and time reports.
- `models/chunter/src/types.ts`: ChatMessage attachments; ThreadMessage owns an attachment edge to its parent activity message while `objectId`/`objectClass` remain contextual references.
- `models/activity/src/index.ts`: inherited replies/reactions, immutable DocUpdateMessage historical payload, ActivityReference source ownership.
- `server-plugins/activity-resources/src/index.ts`: history routing space follows its owning document, `docUpdateMessages` collection; transaction and historical object/update data are historical content.
- `plugins/activity-resources/src/references.ts`: ActivityReference space follows `srcDocId`/`srcDocClass`, while `attachedTo` names a referenced independent target.
- `plugins/activity-resources/src/components/Activity.svelte`: ordinary activity UI combines destination-space messages and separately loaded incoming references from other spaces.

Discovery walks every visited runtime class's inherited collection attributes and all persisted AttachedDoc model classes, queries complete result sets, and deduplicates identical stable records. Ownership admission checks `attachedTo`, `attachedToClass` and declared collection/class edges. Every encountered class is parsed and audited; unsupported runtime classes and unknown edges refuse. Exact audited runtime classes are ChatMessage, ThreadMessage, Attachment, Photo, Embedding, TagReference, TimeSpendReport, ActivityMessage, ActivityInfoMessage, Reaction, ActivityReference and DocUpdateMessage. Future subclasses do not inherit an ownership promise.

History payloads, IDs, author/time metadata, collaborative references, thread context and blob IDs are immutable snapshots. Only project routing `space` changes. Incoming references retain independent source routing; outgoing references owned by the moving source follow it, preserving their independent or dangling targets. No independent document, relationship counterpart, membership or permission is modified.

Default safety limits are 10,000 unique owned records, 10,000 queries, depth 32 and a 10,001-row sentinel. Limit exhaustion, incomplete totals, cycles, conflicting snapshots/ownership and unknown semantics are explicit pre-write refusals. Scoped conditional batches match ownership edges and source-reference ownership and exclude newly added owned rows. These are cooperative SDK conditions; no global isolation or ACID claim is made.

## Criteria and verification map

| Criterion | Implementation and authored evidence |
| --- | --- |
| Independently passes without 309; trees/attributes refused | Existing transfer preflight retained; issue-transfer operation/MCP tests |
| Real inherited/nested model discovery, dedup/full results | `issue-transfer-discovery.ts`; adapter/records tests cover nested classes, duplicates and incomplete results |
| Audited semantics and explicit unsupported/limit refusal | Exact class payload parsers; unknown edge/class, ownership mismatch, cycle/global/query/depth/result-limit tests |
| Comments/files/labels/time stable content and references | Schema-owned snapshots plus routing writes; rich operation and real-Huly fixture |
| Independent documents/relationships/history accessible | Source-owned Reference routing; independent/dangling tests; fixture checks destination reads and independent document snapshots |
| Ancestor time/estimation and owned spaces | Existing hierarchy/closure verification retained; fixture logs 1.25 hours and checks ancestor childInfo/estimation/time |
| No-op ownership and concrete failure inspection | No-op checks complete known closure and correct spaces, refuses absent inspection; failure reports record IDs and catalog-valid inspection calls |
| Existing permission boundary unchanged | Private membership/restricted project preflight retained; project snapshots include membership/private/restricted state; final permission certification remains required |
| Ordinary Huly, no fixed four-class walk or reference relocation | Model discovery plus explicit audited payload table; source provenance above |
| Same MCP/CLI operation and schema-owned results | Shared operation, input/output schemas, tool/catalog descriptions; rich shell fixture runs both transports |
| Rich leaf coverage and required gates/live suites | Adapter/record/application tests and `integration_test_issue_transfer.sh` with SDK reference/unknown-class seed helper |

Narrow verification before the last no-op fixture refinement: 39 tests passed across adapter, record discovery, shared operation and MCP movement. A subsequent focused run passed 19 tests in adapter/discovery/rich-operation suites, including concurrent closure guards and payload-failure reporting (42.96 seconds). The newest missing-adapter no-op correction and movement-fixture refinement were added after that run and are untested pending the root's serialized verification slot. The complete gate remains pending. Complexity check of changed production modules passed before the final no-op refinement. No live Huly test was run, by the user's final-only integration instruction. Root owns final combined MCP, CLI, permission and full-regression certification after all six slices integrate.
