# Item 21: Centralize CJS require() interop

## Problem

CJS `require()` interop with eslint-disable comments was duplicated across 14 files (13 source files + 1 test file). Each occurrence required a 2-line pattern: an eslint-disable comment and a `require().default as typeof import()` expression. Some files had up to 4 such blocks. Total: 28 require() calls scattered across the codebase.

## Solution

Created `src/huly/huly-plugins.ts` as the single CJS interop boundary. It centralizes all 12 Huly platform plugin requires:

- `@hcengineering/activity`
- `@hcengineering/attachment`
- `@hcengineering/calendar`
- `@hcengineering/chunter`
- `@hcengineering/contact`
- `@hcengineering/core`
- `@hcengineering/document`
- `@hcengineering/notification`
- `@hcengineering/tags`
- `@hcengineering/task`
- `@hcengineering/time`
- `@hcengineering/tracker`

The eslint-disable/enable block appears exactly once in the new file. All consumer files now use standard `import { ... } from "../huly-plugins.js"` instead.

## Files changed

- **Created**: `src/huly/huly-plugins.ts`
- **Updated** (14 files, removed require + eslint-disable, added import):
  - `src/huly/operations/activity.ts`
  - `src/huly/operations/attachments.ts`
  - `src/huly/operations/calendar.ts`
  - `src/huly/operations/channels.ts`
  - `src/huly/operations/comments.ts`
  - `src/huly/operations/contacts.ts`
  - `src/huly/operations/contacts.test.ts`
  - `src/huly/operations/documents.ts`
  - `src/huly/operations/issues.ts`
  - `src/huly/operations/milestones.ts`
  - `src/huly/operations/notifications.ts`
  - `src/huly/operations/projects.ts`
  - `src/huly/operations/search.ts`
  - `src/huly/operations/shared.ts`
  - `src/huly/operations/time.ts`

## Verification

- `pnpm build` -- pass
- `pnpm typecheck` -- pass
- `pnpm lint` -- 0 errors (127 warnings, all pre-existing)
- `pnpm test` -- 755 tests pass
