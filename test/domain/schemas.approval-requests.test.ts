import { describe, it } from "@effect/vitest"
import { Effect, Exit, Predicate, Schema } from "effect"
import { expect } from "vitest"

import {
  addApprovalRequestParamsJsonSchema,
  ApprovalRequestDetailSchema,
  ApprovalRequestMutationResultSchema,
  approveApprovalRequestParamsJsonSchema,
  cancelApprovalRequestParamsJsonSchema,
  getApprovalRequestParamsJsonSchema,
  listApprovalRequestsParamsJsonSchema,
  parseAddApprovalRequestParams,
  parseApproveApprovalRequestParams,
  parseCancelApprovalRequestParams,
  parseGetApprovalRequestParams,
  parseListApprovalRequestsParams,
  parseRejectApprovalRequestParams,
  rejectApprovalRequestParamsJsonSchema
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

  it.effect("parses approval request write params", () =>
    Effect.gen(function*() {
      const created = yield* parseAddApprovalRequestParams({
        attachedTo: "issue-1",
        attachedToClass: "tracker:class:Issue",
        requested: ["person-1", "jane@example.com"],
        requiredApprovesCount: 1,
        tx: { _class: "core:class:TxUpdateDoc", objectId: "issue-1" }
      })
      const approved = yield* parseApproveApprovalRequestParams({ request: "request-1", comment: "Approved" })
      const rejected = yield* parseRejectApprovalRequestParams({ request: "request-1", comment: "No" })
      const cancelled = yield* parseCancelApprovalRequestParams({ request: "request-1" })

      expect(created.requested).toEqual(["person-1", "jane@example.com"])
      expect(created.tx).toEqual({ _class: "core:class:TxUpdateDoc", objectId: "issue-1" })
      expect(approved.comment).toBe("Approved")
      expect(rejected.comment).toBe("No")
      expect(cancelled.request).toBe("request-1")
    }))

  it.effect("rejects empty requested people and missing rejection comments", () =>
    Effect.gen(function*() {
      const noRequested = yield* parseAddApprovalRequestParams({
        attachedTo: "issue-1",
        attachedToClass: "tracker:class:Issue",
        requested: [],
        tx: {}
      }).pipe(Effect.exit)
      const noRejectComment = yield* parseRejectApprovalRequestParams({ request: "request-1" }).pipe(Effect.exit)

      expect(Exit.isFailure(noRequested)).toBe(true)
      expect(Exit.isFailure(noRejectComment)).toBe(true)
    }))

  it("emits client-safe JSON Schema for approval request tool inputs", () => {
    expect(Predicate.isRecord(listApprovalRequestsParamsJsonSchema)).toBe(true)
    expect(Predicate.isRecord(getApprovalRequestParamsJsonSchema)).toBe(true)
    expect(Predicate.isRecord(addApprovalRequestParamsJsonSchema)).toBe(true)
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
    expect(addApprovalRequestParamsJsonSchema).toMatchObject({
      type: "object",
      required: ["attachedTo", "attachedToClass", "requested", "tx"]
    })
    expect(approveApprovalRequestParamsJsonSchema).toMatchObject({
      type: "object",
      required: ["request"]
    })
    expect(rejectApprovalRequestParamsJsonSchema).toMatchObject({
      type: "object",
      required: ["request", "comment"]
    })
    expect(cancelApprovalRequestParamsJsonSchema).toMatchObject({
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

  it.effect("validates mutation output variants and rejects impossible action fields", () =>
    Effect.gen(function*() {
      const decoded = yield* Schema.decodeUnknown(ApprovalRequestMutationResultSchema)({
        request: "request-1",
        action: "rejected",
        changed: true,
        status: "Rejected",
        comment: "comment-1"
      })
      const impossible = yield* Schema.decodeUnknown(ApprovalRequestMutationResultSchema)({
        request: "request-1",
        action: "rejected",
        changed: true,
        status: "Rejected"
      }).pipe(Effect.exit)

      expect(decoded).toEqual({
        request: "request-1",
        action: "rejected",
        changed: true,
        status: "Rejected",
        comment: "comment-1"
      })
      expect(Exit.isFailure(impossible)).toBe(true)
    }))
})
