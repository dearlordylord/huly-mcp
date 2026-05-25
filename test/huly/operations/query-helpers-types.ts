import type { Issue as HulyIssue } from "@hcengineering/tracker"

import { hulyQuery } from "../../../src/huly/operations/query-helpers.js"

hulyQuery<HulyIssue>({ identifier: "TEST-1" })

// @ts-expect-error nested dot-key queries bypass Huly's stored document shape.
hulyQuery<HulyIssue>({ "blockedBy._id": "issue-1" })
