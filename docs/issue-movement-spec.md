# Unified issue movement and actionable transfer conflicts

## Problem Statement

An LLM agent can currently change a tracker issue's parent within its project but cannot move the issue to another project through this integration. Manually recreating tasks loses identity, history, relationships, and the original tree. A project change also requires decisions about project attribute references, workflow compatibility, and the task's new location.

The agent needs one understandable operation that preserves the issue tree and either completes the move or explains every discovered incompatibility and exactly how to resolve it. This specification follows the user request in [reporter issue #304](https://github.com/dearlordylord/huly-mcp/issues/304); it is a separate implementation specification and does not replace the reporter's proposal.

## Solution

Extend and redesign the single `move_issue` operation to describe the desired destination of an existing task tree: a project, a parent task, or the top level of its current project. Infer the source project from the selected issue.

Preserve issue identity, content, history, and relationships. Carry the complete descendant tree and task-owned records. Assign new project identifiers only when crossing projects.

Automatically resolve project attribute references through exact unique name matches. Stop before any move-related write when conflicts remain, returning all discovered conflicts and an actionable way to supply replacements or explicitly discard particular references. Preserve task types and statuses; conversion between workflows is deferred.

The feature must work with ordinary Huly installations. Backward compatibility does not constrain the redesigned API or internal architecture.

## User Stories

1. As an LLM agent, I want one movement operation, so that I do not have to choose between separate tools for changing a parent and changing a project.
2. As an LLM agent, I want to understand the operation from its schema and description, so that I can form a correct call without separate documentation.
3. As an LLM agent, I want to select an issue by its complete identifier or stable ID, so that the server can determine its source project.
4. As a project user, I want to move a task to another project, so that it lives with the work it belongs to.
5. As a project user, I want all descendants to follow the task, so that the internal hierarchy remains intact.
6. As a project user, I want to choose a destination parent, so that the transferred tree can join an existing tree.
7. As a project user, I want to move a task to the top level, so that it no longer belongs to its previous parent.
8. As an LLM agent, I want contradictory or cyclic destinations rejected, so that malformed calls cannot corrupt the hierarchy.
9. As a project user, I want task identities and historical content preserved, so that movement does not recreate my work.
10. As a project user, I want comments, labels, attachments, and time reports to remain attached and usable, so that the task retains its supporting data.
11. As a project user, I want links to independent documents preserved, so that moving a task does not relocate unrelated documents.
12. As a project user, I want incoming and outgoing task relationships preserved, so that dependencies continue to work.
13. As an LLM agent, I want a complete mapping of old and new identifiers, so that I can continue working on every moved task.
14. As a project user, I want the displayed hierarchy, child counts, and time and estimation aggregates to remain correct, so that both projects show accurate information.
15. As an LLM agent, I want compatible project attributes matched automatically, so that straightforward moves take one call.
16. As an LLM agent, I want all discovered issue transfer conflicts returned together, so that I can resolve them in one subsequent call.
17. As an LLM agent, I want replacement candidates with stable IDs and distinguishing details, so that I can select a valid destination value.
18. As an LLM agent, I want to explicitly discard one project attribute reference, so that I can authorize a specific loss without permitting unrelated losses.
19. As an LLM agent, I want the conflict response to explain the exact resolution fields, so that I know how to make the next call.
20. As a project user, I want a conflict to leave the workspace unchanged by the attempted move, so that reviewing conflicts does not partially execute the operation.
21. As a project user, I want consent to discard an attribute tied to its expected current value, so that it cannot silently apply to a newly changed value.
22. As an LLM agent, I want newly discovered descendants checked on each call, so that previous resolutions do not authorize losses on new tasks.
23. As a project user, I want current task types and statuses preserved, so that a completed task does not become open during movement.
24. As an LLM agent, I want incompatible workflow values identified precisely, so that I can select a compatible destination.
25. As a project user, I want destination project permissions respected, so that moving a task does not silently grant membership or broaden access.
26. As an LLM agent, I want already satisfied destinations handled without repeated renumbering, so that repeating an operation does not cause unnecessary changes.
27. As an LLM agent, I want connection failures distinguished from confirmed refusal, so that I do not mistake an uncertain write for an unchanged workspace.
28. As an LLM agent, I want stable task IDs and concrete inspection instructions after an uncertain outcome, so that I can determine what happened.
29. As a CLI user, I want the same movement semantics and conflict information, so that command-line and MCP workflows agree.
30. As a maintainer, I want a shared movement core and an explicit SDK boundary, so that future movement capabilities do not duplicate domain rules.
31. As a maintainer, I want deferred capabilities stated explicitly, so that implementation does not silently expand into workflow conversion or object cloning.

## Implementation Decisions

### Public command and destination

- Use one public `move_issue` for changing project and/or parent. Replace the existing contract as needed; no legacy input compatibility layer is required.
- Input contains `issue`, `destination`, and optional `resolutions`. The source project is inferred. Issue and parent selectors accept complete identifiers or stable IDs; project selectors accept project identifiers or stable IDs.
- `destination` contains optional `project` and optional `parent`, but must specify at least one. Encode valid shapes in the schema and explain omitted values and explicit nulls in descriptions.
- Specifying a project without a parent means top level in that project.
- Specifying a concrete parent without a project infers the parent's project. Supplying both requires agreement.
- Specifying only `parent: null` means top level in the issue's current project.
- Preserve all internal descendant relationships. A destination cannot be the selected task or any descendant. Cross-project movement removes the root's former parent relationship.
- Resolve one root within one workspace. Detect inconsistent trees, cycles, and duplicate traversal. Do not use derived child counts as the sole source for discovering descendants.
- A destination already satisfied is a successful no-op; do not reserve numbers or change identifiers. Moving within the current project preserves identifiers.

### Identity, data ownership, and permissions

- Preserve each issue's stable ID, content, author information, history, and incoming/outgoing relationships.
- Assign a valid new number and identifier to each issue crossing projects. Reserve numbers through the existing SDK-supported sequence mechanism; unused numbers after a failure may leave gaps and must not be reused unsafely.
- Allocate consistent destination ordering for the moved tree.
- Task-owned attached records follow the move, including comments, tag references, attachments, time reports, and supported nested records.
- Independent linked documents stay in their own locations. Preserve references to them; their availability remains governed by their existing Huly permissions.
- Do not rewrite historical events or plain-text mentions to pretend the task was always in its destination.
- Apply normal destination project permissions. Do not change project membership or grant additional rights. Preserving data does not promise that every former participant retains access.
- Ensure ancestry identifiers and spaces, direct child counts, descendant information, and time/estimation aggregates are correct for old and new ancestors. Establish server-trigger responsibility before introducing manual derived-data writes.

### Project attributes and actionable conflicts

- Component and milestone resolution priority is: explicit per-task resolution; preservation of an already valid reference; exact unique name match in the destination; otherwise conflict.
- Name matching is exact and unique. Do not resolve ambiguous names arbitrarily or introduce undocumented fuzzy matching.
- Explicit resolutions contain `issueId`, `field`, `from`, and `to`. Initially supported fields are `component` and `milestone`. `from` is the expected current value's stable ID; `to` is a valid destination value's stable ID or explicit null to discard that reference.
- Resolution consent applies only to the addressed issue, field, and expected value. It does not apply to all descendants or all occurrences of the same component.
- Reject duplicate resolutions, targets outside the task tree, invalid replacements, and obsolete resolutions before writes. A changed expected value is a stale-resolution conflict with the current value reported.
- Rebuild the tree and resolve current data on every call. A conflict response does not reserve identifiers or freeze a plan.
- Return all discoverable conflicts from the complete inspected tree, including attribute and workflow incompatibilities. If discovery cannot complete, report that limitation rather than claiming an exhaustive list.
- A blocked response includes `outcome: blocked`, `changed: false`, stable root/destination IDs, and structured conflicts. Each attribute conflict includes a code, issue ID and current identifier, field, current value ID/name, valid replacement options with distinguishing details, and whether clearing is allowed.
- Include actionable next-call instructions describing how to reuse the original destination and supply `resolutions`. Stable IDs and field names in the response must agree exactly with the accepted input schema.
- Refuse before any move-related writes, including sequence reservation, when unresolved conflicts or invalid resolutions remain.
- Do not silently truncate conflicts or ambiguous replacement candidates. If a safety limit prevents full processing, refuse before writes with a useful explanation.
- Return every automatic and explicit attribute change with old/new values and a reason.

### Workflow boundary

- Preserve each task's current kind and status. Confirm that the destination supports the actual values of every task, including descendants.
- No name-based status conversion, default-status reset, or task-type conversion.
- Return unsupported tasks and values as workflow conflicts. The supported resolution is selecting a compatible destination; do not suggest nonexistent conversion parameters or clearing a required status.
- Whether the ordinary Huly model additionally requires equal project types must be established against the installed SDK and supported server behavior. Use any necessary restriction explicitly in the description and rejection reason, rather than inferring compatibility from labels alone.

### Architecture, failures, and results

- Use Effect Schema as the source of truth for command, inspected boundary data, conflict results, and completion results. Parse boundary data into meaningful domain values; expected failures remain typed Effect failures.
- Share one application operation between MCP and CLI. Keep target resolution, planning, hierarchy decisions, and attribute transformations in reusable domain/application modules.
- Keep SDK hierarchy inspection, network reads, sequence reservation, batch execution, and verification in the Huly adapter. Prefer the existing HulyClient injection boundary; introduce only the adapter capabilities needed by the shared operation.
- Discover owned collections from the Huly model rather than relying solely on a fixed short class list. Unsupported collection behavior must be detected before writes; do not blindly move arbitrary referenced records.
- Build and validate the complete plan before executing it. Use SDK batch/conditional capabilities where appropriate, inspect commit results, and account for eventual consistency during bounded verification.
- SDK `apply` and `scope` do not alone prove global isolation or ACID semantics. Verify the exact server behavior; do not advertise those guarantees based on batching.
- Detect concurrent changes where the available SDK permits and verify affected tasks, ownership records, and derived hierarchy after execution. Never label an observed inconsistent result as completed.
- Distinguish confirmed pre-write refusal from incomplete execution or an indeterminate outcome after a lost response. Report what is known, stable IDs, and concrete inspection steps. Never report `changed: false` when writes may have occurred.
- Do not automatically reallocate identifiers or rerun an uncertain move. Do not automatically roll back over subsequent user edits.
- A completed result includes stable root/destination IDs, the actual destination parent, the complete task list with stable IDs, previous/current identifiers, parent IDs and usable links, attribute changes, and relevant warnings. Distinguish a completed move from a no-op.
- Update MCP descriptions, discoverable input/output schemas, CLI command inputs, generated documentation, and examples together. Explain the cross-project identifier change and all destination forms from the tool itself.

## Testing Decisions

- Test observable behavior and resulting Huly state, not private helper calls or a prescribed number of SDK calls.
- Prefer one application-level seam: the shared movement operation using the existing HulyClient service with real injected stub implementations. Follow the existing Effect-aware issue-operation tests; module mocks, spies, and monkey-patching remain prohibited.
- Exercise parsing, conflict aggregation, exact matching, destination rules, resolution precedence, stale consent, duplicate/invalid resolutions, no-op behavior, and typed failure outcomes at that seam.
- Verify the conflict-to-resolution round trip: an agent can construct the next accepted call from the schema and returned IDs/instructions without undocumented knowledge.
- Add focused property tests for genuine tree/planning invariants where they provide stronger coverage: preserved issue IDs and internal edges, absence of cycles, valid parent references, unique destination identifiers, and scoped discard consent.
- Extend existing real-Huly issue-parent and relation integration patterns through MCP; verify equivalent CLI behavior using the same application operation.
- Use disposable projects and a tree at least three levels deep, with a source parent and a destination parent. Include comments, nested attachments, labels, time reports, descriptions, independent document references, incoming/outgoing task relations, components, and milestones.
- Assert new identifiers for cross-project moves, stable IDs, correct attached-record spaces, preserved references/history, old/new ancestry, child counts, descendant information, time/estimation aggregates, and correct ordering.
- Assert conflicts leave tasks, attached records, project sequences, and attributes unchanged. Exercise multiple simultaneous conflicts, absent and ambiguous matches, explicit replacement, and per-task null clearing.
- Test supported mixed kinds/statuses, incompatible destinations, self/descendant parenting, malformed destinations, same-project moves, and repeated already satisfied calls.
- Test normal Huly permission failures without broadening membership or access.
- Exercise two real clients adding descendants, comments, or time reports during movement; interrupted writes and lost replies; commit refusal; and eventual-consistency verification. Establish actual ordinary-Huly behavior before asserting stronger guarantees.
- Identify the server version used for certification and resolve parent-array ordering and server-trigger interactions empirically. Local reference forks are research evidence, not proof of the deployed server contract.
- Before completing implementation, run `pnpm check-all` and required MCP/CLI integrations against local Docker Huly. Use platform-local dependencies and the documented container URL override; do not defer integration execution to the user.

## Out of Scope

- Requiring a custom Huly server extension.
- Backward-compatibility shims for the old movement input contract.
- Workflow conversion or status/type mapping. This is an explicit deferred capability.
- Automatic component or milestone creation during movement. Agents can create supported objects through separate existing operations, then retry.
- Preview/dry-run mode, mandatory prepare/commit protocols, plan tokens, and confirmation workflows.
- Blanket force flags or automatic discarding of all unresolved values.
- Multiple independent roots, selecting only some descendants, and cross-workspace migration.
- Moving independent linked documents, rewriting historical events or plain-text mentions, preserving all former users' access, or redirecting old human-readable identifiers.
- A durable operation journal or exactly-once promise in the initial API; do not expose an idempotency key without a real implementation.
- Unproven atomicity and unconditional automatic rollback.

## Further Notes

This specification synthesizes the reporter's user need, local code/SDK investigation, an independent Astra design, and the accepted design discussion. The reporter's issue remains unchanged; API and implementation choices here are independently selected.

Detailed destination defaults, ownership/access rules, separate creation of missing attributes, and deferral of preview follow the final recommended simple design after the user ended the interview and requested synthesis.

The most significant implementation verification points are ordinary-Huly concurrency behavior and server ownership of ancestry/aggregate updates. Resolve them as implementation evidence, without adding a server-extension requirement or silently weakening success reporting.

Deferred capabilities are listed above for future work; this issue does not imply they are included in the first implementation.

