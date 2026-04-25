import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import {
  createIssueStatusParamsJsonSchema,
  parseCreateIssueStatusParams,
  parseCreateTaskTypeParams,
  parseGetProjectTypeParams
} from "../../src/domain/schemas.js"

describe("task management schemas", () => {
  it.effect("accepts project type and task type display-name refs", () =>
    Effect.gen(function*() {
      const projectType = yield* parseGetProjectTypeParams({ projectType: "Classic" })
      const taskType = yield* parseCreateTaskTypeParams({
        projectType: "Classic",
        name: "Bug",
        templateTaskType: "Issue"
      })

      expect(projectType.projectType).toBe("Classic")
      expect(taskType.templateTaskType).toBe("Issue")
    }))

  it.effect("rejects invalid create_issue_status categories", () =>
    Effect.gen(function*() {
      const result = yield* Effect.either(parseCreateIssueStatusParams({ name: "QA", category: "unknown" }))

      expect(result._tag).toBe("Left")
    }))

  it.effect("exposes the create_issue_status category enum in JSON schema", () =>
    Effect.gen(function*() {
      expect(JSON.stringify(createIssueStatusParamsJsonSchema)).toContain("backlog")
      expect(JSON.stringify(createIssueStatusParamsJsonSchema)).toContain("canceled")
      expect(JSON.stringify(createIssueStatusParamsJsonSchema)).not.toContain("unknown")
    }))
})
