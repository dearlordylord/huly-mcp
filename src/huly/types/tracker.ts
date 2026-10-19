// Local interface for Huly's Gantt scheduling field on tracker issues.
//
// `startDate` exists on tracker.class.Issue in hcengineering/platform (added in
// hcengineering/platform#10851, merged 2026-07-09) but no published
// @hcengineering/tracker carries it yet — the newest on npm is 0.7.423
// (2026-05-10), two months earlier, and the pinned 0.7.0 predates it too.
//
// Declared optional on purpose: the attribute is genuinely absent on workspaces
// served by a Huly build older than that PR, so reads must tolerate its absence.
// Once the SDK ships the field, delete this interface and use Issue directly.
//
// Fields sourced from: plugins/tracker/src/index.ts in hcengineering/platform

import type { Timestamp } from "@hcengineering/core"
import type { Issue } from "@hcengineering/tracker"

export interface ScheduledIssue extends Issue {
  startDate?: Timestamp | null
}
