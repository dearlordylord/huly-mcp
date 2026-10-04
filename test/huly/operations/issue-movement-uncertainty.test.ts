import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import {
  MovementUncertaintyEvidenceSchema,
  MovementVerificationEvidenceSchema
} from "../../../src/domain/schemas/issue-movement-uncertainty.js"

const destination = { projectId: "destination", parentId: "existing-parent" }
const decode = Schema.decodeUnknownOption(MovementUncertaintyEvidenceSchema)
const decodeVerification = Schema.decodeUnknownOption(MovementVerificationEvidenceSchema)

for (const completeness of ["complete", "incomplete"]) {
  it(`rejects contradictory present and absent IDs in ${completeness} verification`, () => {
    const task = { issueId: "root", projectId: "source", parentId: null, identifier: "SOURCE-1", number: 1 }
    const facts = {
      status: "observed",
      completeness,
      consistency: "inconsistent",
      reason: "Another task is absent",
      tasks: [task],
      records: []
    }
    expect(decodeVerification({ ...facts, absentIssueIds: ["child"] })._tag).toBe("Some")
    expect(decodeVerification({ ...facts, absentIssueIds: ["root"] })._tag).toBe("None")
  })

  it(`retains confirmed absence with ${completeness} verification without inventing task payloads`, () => {
    const result = decodeVerification({
      status: "observed",
      completeness,
      consistency: "inconsistent",
      reason: "Child read confirmed absence; another task could not be read.",
      absentIssueIds: ["child"],
      tasks: [],
      records: []
    })
    expect(result._tag).toBe("Some")
    if (result._tag === "Some" && result.value.status === "observed" && result.value.consistency === "inconsistent") {
      expect(result.value.absentIssueIds).toEqual(["child"])
      expect(result.value.tasks).toEqual([])
    }
  })
}

it("does not accept confirmed absence as consistent or merely undetermined verification", () => {
  const facts = { status: "observed", absentIssueIds: ["child"], tasks: [], records: [] }
  expect(decodeVerification({ ...facts, completeness: "complete", consistency: "consistent" })._tag).toBe("None")
  expect(
    decodeVerification({
      ...facts,
      completeness: "incomplete",
      consistency: "undetermined",
      reason: "Other task could not be read"
    })._tag
  ).toBe("None")
})

it("rejects a forbidden absence property rather than stripping it through the union", () => {
  for (const absentIssueIds of [[], undefined]) {
    expect(
      decodeVerification({
        status: "observed",
        completeness: "complete",
        consistency: "consistent",
        tasks: [],
        records: [],
        absentIssueIds
      })._tag
    ).toBe("None")
    expect(
      decodeVerification({
        status: "observed",
        completeness: "incomplete",
        consistency: "undetermined",
        reason: "Read unavailable",
        tasks: [],
        records: [],
        absentIssueIds
      })._tag
    ).toBe("None")
  }
})

it("keeps unread verification undetermined without asserting an absence", () => {
  const result = decodeVerification({
    status: "observed",
    completeness: "incomplete",
    consistency: "undetermined",
    reason: "Task request unavailable",
    tasks: [],
    records: []
  })
  expect(result._tag).toBe("Some")
  if (result._tag === "Some") expect(result.value).not.toHaveProperty("absentIssueIds")
})

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
})
