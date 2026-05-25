# Explicit No-Op Semantics Cleanup

## Reminder

Clean up APIs where omitted input, an empty object, or an identifier-only update request currently mean the same thing.

Tracking issue: https://github.com/dearlordylord/huly-mcp/issues/55

## Scope

1. `src/mcp/server.ts` currently calls tools with `args ?? {}`. This makes an omitted MCP `arguments` field indistinguishable from an explicit empty object for every tool.
2. Update tools should reject identifier-only requests instead of resolving the target and returning `updated: false`.
3. `list_relations` with `direction: "either"` and a specified association should reject endpoint classes that do not fit either association orientation instead of resolving them and returning an empty list.

## No-Op Update APIs To Reject

- `update_project`
- `update_issue`
- `edit_document`
- `update_teamspace`
- `update_label`
- `update_component`
- `update_event`
- `update_attachment`
- `update_card`
- `update_person`
- `update_organization`
- `update_channel`
- `update_milestone`
- `update_issue_template`
- `update_test_suite`
- `update_test_case`
- `update_test_plan`
- `update_test_run`
- `update_test_result`
- `update_user_profile`
- `update_guest_settings`
- `update_tag_category`

## Suggested Implementation

- Add a shared parse helper for "at least one of these fields is defined" and apply it to each update schema.
- Keep true zero-argument tools on `EmptyParamsSchema` or no-params handlers so omitted `arguments` is only accepted for genuinely no-arg tools.
- Add operation-level guards for direct operation calls, not just schema-level guards, so tests and internal callers cannot bypass the behavior.
- Map the resulting domain error to `InvalidParams`.

## Done In This Worktree

- `list_relations` now validates `direction: "either"` endpoint classes when an association is specified.

## Still To Do

- The repo-wide no-op update rejection and missing-arguments registry behavior are not yet implemented in this worktree.
