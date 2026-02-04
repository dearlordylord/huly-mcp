# Known Problems & Context for Resolution

## 1. Ugly Type Casts in shared.ts

**Location**: `src/huly/operations/shared.ts:78`

**The Cast**:
```typescript
core.class.Status as Ref<Class<Doc>> as Ref<Class<Status>>
```

**Why It Exists**:
- `core.class.Status` is typed as a string constant in Huly SDK
- `client.findAll<Status>()` expects `Ref<Class<Status>>`
- TypeScript can't infer the correct type narrowing
- Double cast is needed to satisfy type checker

**Context for Resolution**:
1. Check `@hcengineering/core` package for proper exported class references
2. Look for alternative ways to reference Status class
3. Possible approaches:
   - Use string literal: `"core:class:Status"` directly
   - Check if Huly SDK exports typed class references
   - File issue with Huly SDK for better type definitions

**Non-blocking**: Code works correctly at runtime, just ugly types.

---

## 2. IssueStatus/Status Query Failure - ACTIVE BUG ❌

**Status**: NOT RESOLVED - attempted fix failed

**Original Problem**:
```
Connection error: findAll failed: TypeError: Cannot read properties of null (reading '#<Object>')
```

**Affected Operations** (all fail):
- `list_issues`
- `get_issue`
- `create_issue` with status param
- `update_issue` with status param

**Root Cause**:
- Querying `tracker.class.IssueStatus` fails
- Querying `core.class.Status` ALSO fails (attempted fix)
- Likely: Status documents have malformed/null data on this workspace
- OR: Huly SDK has deserialization bug for Status class

**Attempted Fix** (commit 22a1e65) - FAILED:
- Created `findProjectWithStatuses()` helper in `shared.ts`
- Uses Project lookup with `lookup: { type: task.class.ProjectType }`
- Attempts to query `core.class.Status` with `$in` filter on status refs
- **Result**: Still fails with same error on line 85-88 of shared.ts

**What Was Tried**:
1. ✅ Removed `tracker.class.IssueStatus` queries
2. ❌ Query `core.class.Status` directly - STILL FAILS
3. Pattern matches official huly-examples approach

**Next Steps to Investigate**:
1. Test on different Huly workspace to isolate issue
2. Check if ANY Status query works (single ID lookup vs findAll)
3. Try string literal `"core:class:Status"` instead of class constant
4. Check Huly SDK version compatibility
5. Report to Huly SDK if confirmed bug

**Possible Workarounds**:
- Use `project.defaultIssueStatus` without name resolution
- Skip status param validation entirely
- Return status refs instead of names
- Don't query Status class at all

---

## 3. Testing Without Blocking

**Status**: RESOLVED

**Problem**: MCP stdio server blocks indefinitely for testing

**Solution**: `MCP_AUTO_EXIT=true` environment variable

**Implementation**:
- `src/index.ts`: Added `getAutoExit` config
- `src/mcp/server.ts`: Conditionally listen for stdin `end`/`close` events
- When `autoExit=true`, server exits when stdin closes
- When `autoExit=false` (default), server runs indefinitely (normal MCP behavior)

**Usage**:
```bash
printf '...' | MCP_AUTO_EXIT=true node dist/index.cjs
```

**Documentation**: See `INTEGRATION_TESTING.md` for full guide

---

## 4. Manual Test Results (2026-02-04)

**Workspace**: internalai @ huly.app.monadical.io

### Working ✅
- `list_projects` - 3 projects
- `list_teamspaces` / `list_documents` / `get_document` / `create_document` / `update_document` / `delete_document`
- `list_persons` / `list_employees` - with emails (N+1 fix working)
- `list_milestones` / `get_milestone` / `create_milestone` / `delete_milestone`
- `list_channels` / `get_channel` (members resolved correctly - 13 members)
- `list_direct_messages` / `list_channel_messages`
- `list_events` / `list_work_slots`
- `create_issue` (without status param only)
- `add_issue_label` / `delete_issue`

### Broken ❌
- **`list_issues`** - Status query fails
- **`get_issue`** - Status query fails
- **`create_issue` with status param** - Status query fails
- **`update_issue`** - Status query fails (if status param provided)

### Notes
- `create_milestone` requires `targetDate` as Unix timestamp (milliseconds)
- Status query bug blocks all issue read/list operations
- Issue create/label/delete work when not querying status

---

## 5. Potential Future Improvements

### A. Simplify Status Type Cast
**Where**: `src/huly/operations/shared.ts:78`
**Action**: Research Huly SDK for cleaner Status class reference

### B. Add Integration Tests
**Where**: Currently manual only
**Action**: Add automated integration test suite that runs against test workspace

### C. Error Messages
**Where**: Various operations
**Action**: Review error messages for clarity, ensure they provide actionable info

### D. Performance Monitoring
**Where**: N/A currently
**Action**: Add optional performance logging for slow operations

---

## 6. Type Safety Notes

Per `CLAUDE.md` type cast policy:
- Type casts (`as T`) are considered a slop
- Must be clearly justified with comments
- Document evidence/API docs supporting the cast

**Current justified cast**: `shared.ts:78` - documented above, needed due to Huly SDK type limitations.
