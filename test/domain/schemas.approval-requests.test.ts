import { describe, it } from "@effect/vitest"
import { Effect, Exit, Predicate, Schema } from "effect"
import { expect } from "vitest"

import {
  ApprovalRequestDetailSchema,
  getApprovalRequestParamsJsonSchema,
  listApprovalRequestsParamsJsonSchema,
  parseGetApprovalRequestParams,
  parseListApprovalRequestsParams
} from "../../src/domain/schemas/approval-requests.js"

describe("approval request schemas", () => {
  it.effect("parses list/get approval request params", () =>
    Effect.gen(function*() {
      const listed = yield* parseListApprovalRequestsParams({
        status: "Active",
        attachedTo: "issue-1",
        attachedToClass: "tracker:class:Issue",
        limit: 10
      })
      const detailed = yield* parseGetApprovalRequestParams({ request: "request-1" })

      expect(listed).toMatchObject({
        status: "Active",
        attachedTo: "issue-1",
        attachedToClass: "tracker:class:Issue",
        limit: 10
      })
      expect(detailed.request).toBe("request-1")
    }))

  it.effect("rejects unsupported statuses and empty ids", () =>
    Effect.gen(function*() {
      const badStatus = yield* parseListApprovalRequestsParams({ status: "Pending" }).pipe(Effect.exit)
      const emptyRequest = yield* parseGetApprovalRequestParams({ request: "" }).pipe(Effect.exit)

      expect(Exit.isFailure(badStatus)).toBe(true)
      expect(Exit.isFailure(emptyRequest)).toBe(true)
    }))

  it("emits client-safe JSON Schema for approval request tool inputs", () => {
    expect(Predicate.isRecord(listApprovalRequestsParamsJsonSchema)).toBe(true)
    expect(Predicate.isRecord(getApprovalRequestParamsJsonSchema)).toBe(true)
    expect(listApprovalRequestsParamsJsonSchema).toMatchObject({
      type: "object",
      properties: {
        status: {},
        attachedTo: {},
        attachedToClass: {},
        limit: {}
      }
    })
    expect(getApprovalRequestParamsJsonSchema).toMatchObject({
      type: "object",
      required: ["request"]
    })
  })

  it.effect("validates detail output while preserving opaque SDK tx payloads", () =>
    Effect.gen(function*() {
      const decoded = yield* Schema.decodeUnknown(ApprovalRequestDetailSchema)({
        id: "request-1",
        class: "request:class:Request",
        status: "Completed",
        attachedTo: "issue-1",
        attachedToClass: "tracker:class:Issue",
        collection: "requests",
        space: "space-1",
        requiredApprovesCount: 2,
        requested: [{ id: "person-1", name: "Doe,Jane", email: "jane@example.com", url: "https://huly.test/contact" }],
        approved: [{ id: "person-1", name: "Doe,Jane", email: "jane@example.com", url: "https://huly.test/contact" }],
        approvedDates: [1700000000000],
        comments: 1,
        createdOn: 1699999999000,
        modifiedOn: 1700000001000,
        tx: { _class: "core:class:Tx", nested: { objectId: "issue-1" } }
      })

      expect(decoded.tx).toEqual({ _class: "core:class:Tx", nested: { objectId: "issue-1" } })
      expect(decoded.requested[0]?.email).toBe("jane@example.com")
    }))
})
