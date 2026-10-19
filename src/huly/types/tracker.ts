// Schema-owned contract for Huly's Gantt scheduling field on tracker issues.
//
// `startDate` exists on tracker.class.Issue in hcengineering/platform (added in
// hcengineering/platform#10851, merged 2026-07-09), but no published
// @hcengineering/tracker carries it yet: the newest on npm is 0.7.423
// (2026-05-10), two months earlier, and the pinned 0.7.0 predates it too.
//
// Per AGENTS.md the schema owns this boundary field, so it is declared as an
// Effect Schema and composed with the SDK type at the adapter boundary rather
// than hand-written onto it. Delete both once the SDK ships the field.
//
// Field sourced from: plugins/tracker/src/index.ts in hcengineering/platform

import type { Issue } from "@hcengineering/tracker"
import { Schema } from "effect"

import { Timestamp } from "../../domain/schemas/shared.js"

/**
 * `optionalKey`, not `optional`: a workspace served by a Huly build older than
 * the upstream PR has no such attribute at all, and that absence is distinct
 * from an explicit `undefined`, which is not part of the accepted contract.
 */
export const IssueScheduleSchema = Schema.Struct({ startDate: Schema.optionalKey(Schema.NullOr(Timestamp)) })

export type IssueSchedule = Schema.Schema.Type<typeof IssueScheduleSchema>

/** SDK issue composed with the schema-owned scheduling field. */
export type ScheduledIssue = Issue & IssueSchedule
