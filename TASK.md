# Code Duplication Refactor

## Problem

Helper functions are duplicated across multiple domain operation files:

### `findProject(projectIdentifier: string)`
- `src/huly/operations/issues.ts`
- `src/huly/operations/milestones.ts`
- `src/huly/operations/documents.ts`
- `src/huly/operations/time.ts`

### `parseIssueIdentifier(identifier: string)`
- `src/huly/operations/issues.ts`
- `src/huly/operations/milestones.ts`
- `src/huly/operations/time.ts`

### `findProjectAndIssue(project, identifier)`
- `src/huly/operations/issues.ts`
- `src/huly/operations/comments.ts`
- `src/huly/operations/time.ts`

## Solution

Extract to shared module: `src/huly/operations/shared.ts` or `src/huly/helpers.ts`

## Priority

Medium - no bugs, just maintenance burden.
