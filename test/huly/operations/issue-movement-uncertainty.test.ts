import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { MovementUncertaintyEvidenceSchema } from "../../../src/domain/schemas/issue-movement-uncertainty.js"

const destination = { projectId: "destination", parentId: "existing-parent" }
const decode = Schema.decodeUnknownOption(MovementUncertaintyEvidenceSchema)

describe("movement uncertainty evidence contract", () => {
  it("records a lost allocation response without guessing a number or a historical mapping", () => {
    const result = decode({
      destination,
      discovery: { status: "complete" },
      verification: { status: "not-attempted" },
      execution: { phase: "allocation", commit: "not-sent", reservations: [{ status: "uncertain", issueId: "root" }] }
    })
    expect(result._tag).toBe("Some")
    if (result._tag === "Some") expect(result.value.execution.reservations[0]).not.toHaveProperty("number")
  })

  it("requires a limitation for incomplete discovery and a reason for unavailable verification", () => {
    const base = { destination, execution: { phase: "commit", commit: "reply-lost", reservations: [] } }
    expect(
      decode({ ...base, discovery: { status: "incomplete" }, verification: { status: "not-attempted" } })._tag
    ).toBe("None")
    expect(decode({ ...base, discovery: { status: "complete" }, verification: { status: "unavailable" } })._tag).toBe(
      "None"
    )
  })

  it("includes actual current stable IDs and ownership when an inconsistent state was observed", () => {
    const result = decode({
      destination,
      discovery: { status: "complete" },
      execution: {
        phase: "verification",
        commit: "acknowledged",
        reservations: [{ status: "confirmed", issueId: "root", number: 8 }]
      },
      verification: {
        status: "observed",
        completeness: "complete",
        consistency: "inconsistent",
        reason: "Child stayed in source",
        tasks: [{ issueId: "child", projectId: "source", parentId: "root", identifier: "SOURCE-3", number: 3 }],
        records: [
          {
            recordId: "comment",
            objectClass: "chunter:class:ChatMessage",
            projectId: "source",
            attachedTo: "child",
            attachedToClass: "tracker:class:Issue",
            collection: "comments"
          }
        ]
      }
    })
    expect(result._tag).toBe("Some")
    if (result._tag === "Some" && result.value.verification.status === "observed")
      expect(result.value.verification.tasks[0]).toMatchObject({ issueId: "child", identifier: "SOURCE-3" })
  })
  it("retains a concrete observed contradiction when additional discovery is incomplete", () => {
    const result = decode({
      destination,
      discovery: { status: "complete" },
      execution: { phase: "verification", commit: "acknowledged", reservations: [] },
      verification: {
        status: "observed",
        completeness: "incomplete",
        consistency: "inconsistent",
        reason: "Parsed child moved to a foreign project; remaining closure is unavailable.",
        tasks: [{ issueId: "child", projectId: "foreign", parentId: "root", identifier: "FOREIGN-3", number: 3 }],
        records: []
      }
    })
    expect(result._tag).toBe("Some")
    if (result._tag === "Some")
      expect(result.value.verification).toMatchObject({
        completeness: "incomplete",
        consistency: "inconsistent",
        tasks: [{ issueId: "child", projectId: "foreign" }]
      })
  })
})
