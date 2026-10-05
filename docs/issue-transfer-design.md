# Issue transfer design

Status: historical discovery notes. The synthesized implementation specification is [Unified issue movement](./issue-movement-spec.md). Pending decisions below describe the interview at the time these notes were recorded; use the specification for the final scope.

## Confirmed design constraints

- Optimize the domain model and API for LLM agents, extensibility, and code clarity.
- Backward compatibility is not a constraint for this work.
- Changes beyond the public API are in scope when they improve the architecture.
- The operation must work with ordinary Huly installations. Requiring a custom server extension is out of scope.
- Unresolved project attributes stop the operation before any transfer-related writes. Report all discovered conflicts together.
- Every conflict must have an actionable resolution path described by the response and API schema. The caller can explicitly discard a specific attribute reference or supply a replacement.
- Use one `move_issue` for changing project and/or parent. Types, schema constraints, and descriptions must make destination semantics and conflict resolution clear without external documentation.
- Automatically match components and milestones by exact unique name in the destination. Missing and ambiguous matches remain conflicts.
- The first version preserves each issue's kind and status and verifies destination compatibility; workflow conversion is deferred.
- Start with a simple initial design. Detailed destination semantics and recovery behavior remain undecided.
- Resolve product decisions through concrete scenarios before selecting implementation mechanisms.
- When the interview is complete, publish the specification in a new GitHub issue linking to reporter issue #304. Do not rewrite the reporter's issue. Explicitly document deferred capabilities in the new issue.

## User outcomes under discussion

A user can relocate an existing tracker issue and its descendant tree to another project while preserving task identity, content, history, and meaningful relationships. The caller can identify every relocated issue afterward and understand any changed project attributes.

The design must distinguish task-owned records from independent linked documents, actual data preservation from project access changes, and a completed operation from an uncertain outcome after a connection failure.

These outcomes are the interview baseline, not a finalized contract. Defaults, scope, and failure semantics remain open.

## Evidence and unresolved technical facts

- Existing `move_issue` changes the parent within one project: `src/huly/operations/issues-move.ts`.
- The installed SDK exposes hierarchy access and `ApplyOperations`: `node_modules/@hcengineering/core/types/operations.d.ts`.
- Huly platform code implements cross-project moves through SDK primitives. Its behavior is evidence of feasibility, not the chosen design: `plugins/tracker-resources/src/utils.ts` in local platform references.
- The independently reviewed server source includes parent-derived data beyond `subIssues`, including `childInfo` and time/estimation aggregates. Exact deployment behavior and trigger ownership need verification.
- A batched SDK commit does not by itself establish isolation from concurrent creation of descendants or attached records. Supported guarantees remain under investigation.
- The order of `parents` differs between a reviewed server source and the local helper. The exact version contract must be resolved before reuse.

## Design tree

Settled decisions:

1. Deployment boundary: standard Huly; no required server extension.
2. Data-loss policy: stop before writes and return all conflicts, with explicit per-conflict replacement or discard available to the caller.
3. One public `move_issue` operation for project and parent changes; understandable from its schema and description.
4. Exact unique name matching for components and milestones is automatic.
5. Preserve existing kinds and statuses; no workflow conversion in the first version.

Open decisions and investigations:

6. Detailed destination defaults, ownership/access semantics, attribute creation, optional preview, and conflict-resolution payload details.
7. SDK and server-trigger guarantees, concurrency and recovery behavior, and whether destination compatibility requires equal project type in addition to valid kind/status values.

Later branches depend on these decisions: concurrency and recovery guarantees, attribute creation and mappings, transfer versus reparenting vocabulary, API shape, preview semantics, access behavior, result identity, adapter responsibilities, and verification.

## Candidate ideas, not decisions

- The issue author proposes a separate cross-project tool, automatic attribute clearing, optional component creation, and a batched collection move.
- The initial assessment supports that scope but questions parameter semantics, retry behavior, and commit guarantees.
- An independent Astra assessment proposes automatic source resolution, default refusal on unresolved attributes, explicit mappings, optional preview, and persistent retry identity. It also identifies server-trigger and concurrency questions.

No candidate is adopted as a package. Each decision will be recorded with its rationale as the interview progresses. ADRs are reserved for consequential architectural trade-offs; the glossary contains only settled domain terms.

## API design

Use a single `move_issue` for changing project and/or parent, with the source project inferred from the issue. An ordinary transfer would be:

```json
{
  "issue": "SRC-42",
  "destination": { "project": "DST" }
}
```

An explicit destination project without a parent means top level. A concrete parent can determine the destination project; an explicit project must agree with it. `parent: null` without a project means top level in the current project. The destination must express at least one choice. The complete descendant tree follows the root.

For project attribute conflicts, return `outcome: blocked`, `changed: false`, and every discovered conflict with the affected stable issue ID, field, current value ID, available replacements, whether clearing is allowed, and instructions for the next call.

The caller repeats the command with explicit per-issue resolutions:

```json
{
  "issue": "issue-root",
  "destination": { "project": "project-dst" },
  "resolutions": [
    {
      "issueId": "issue-root",
      "field": "component",
      "from": "source-component-id",
      "to": "destination-component-id"
    },
    {
      "issueId": "issue-child",
      "field": "milestone",
      "from": "source-milestone-id",
      "to": null
    }
  ]
}
```

`from` records the exact value the caller consented to replace or discard. If the value changes before the next call, return a stale-resolution conflict rather than applying that consent to the new value. Rebuild the tree and checks on every call; newly discovered tasks do not inherit previous discard decisions. Duplicate, invalid, or irrelevant resolutions fail before writes.

Proposed precedence: explicit resolution, preservation of an already valid reference, exact unique name match, then conflict. Exact unique name matching is accepted. Return automatic and explicit changes and the full old/new identifier mapping on completion.

Accepted first-version workflow scope: preserve every issue's current kind and status and verify their validity in the destination. No workflow conversion. Automatic attribute creation remains undecided. Whether equal project type is also required remains a technical and product decision.

No mandatory preview/commit protocol, plan tokens, global force flag, or unsupported idempotency key is proposed for the first API. A lost response after sending writes is an uncertain outcome, not evidence that nothing changed.

## Deferred capabilities

- Workflow conversion, including explicit status and task-type mappings. The first version requires the destination to accept every task's existing kind and status.

## Publication

After shared understanding is confirmed, create a new implementation/specification issue linked to https://github.com/dearlordylord/huly-mcp/issues/304. Include the accepted contract, examples, acceptance criteria, unresolved implementation checks, and the deferred-capability list. Preserve the reporter's original issue unchanged.
