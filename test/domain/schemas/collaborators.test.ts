import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { expect } from "vitest"

import { parseAddObjectCollaboratorParams, parseListObjectCollaboratorsParams } from "../../../src/domain/schemas.js"

describe("collaborator schemas", () => {
  it.effect("enforces exactly one object target locator", () =>
    Effect.gen(function*() {
      const raw = yield* parseListObjectCollaboratorsParams({
        objectId: "issue-1",
        objectClass: "tracker:class:Issue"
      })
      const issue = yield* parseAddObjectCollaboratorParams({
        project: "HULY",
        issueIdentifier: "HULY-1",
        member: "person@example.com"
      })
      const missingRawClass = yield* Effect.either(parseListObjectCollaboratorsParams({ objectId: "issue-1" }))
      const missingIssueIdentifier = yield* Effect.either(parseListObjectCollaboratorsParams({ project: "HULY" }))
      const missingDocument = yield* Effect.either(parseListObjectCollaboratorsParams({ teamspace: "Engineering" }))
      const conflicting = yield* Effect.either(parseListObjectCollaboratorsParams({
        objectId: "issue-1",
        objectClass: "tracker:class:Issue",
        project: "HULY",
        issueIdentifier: "HULY-1"
      }))

      expect(raw.objectId).toBe("issue-1")
      expect(issue.member).toBe("person@example.com")
      expect(missingRawClass._tag).toBe("Left")
      expect(missingIssueIdentifier._tag).toBe("Left")
      expect(missingDocument._tag).toBe("Left")
      expect(conflicting._tag).toBe("Left")
    }))
})
