import type { RequestType } from "@hcengineering/hr"
import type { IntlString } from "@hcengineering/platform"
import { Effect, Schema } from "effect"
import { describe, expect, it } from "vitest"

import {
  HrRequestTypeIdentifier,
  parseAddHrRequestAttachmentParams,
  parseCreateHrRequestParams,
  parseListHrRequestsParams,
  parseUpdateHrRequestAttachmentParams,
  parseUpdateHrRequestParams
} from "../../../src/domain/schemas.js"
import { HrRequestTypeIdentifierAmbiguousError, HrRequestTypeNotFoundError } from "../../../src/huly/errors.js"
import { core, hr } from "../../../src/huly/huly-plugins.js"
import { resolveHrRequestTypeFrom, toHrRequestTypeSummary } from "../../../src/huly/operations/hr-requests.js"
import { toRef } from "../../../src/huly/operations/sdk-boundary.js"

const requestType = (id: string, label: string): RequestType => ({
  _id: toRef<RequestType>(id),
  _class: hr.class.RequestType,
  space: core.space.Model,
  label: Schema.decodeUnknownSync(Schema.declare((input): input is IntlString => typeof input === "string"))(
    `embedded:embedded:${label}`
  ),
  icon: hr.icon.PTO,
  value: -1,
  color: 2,
  modifiedBy: core.account.System,
  modifiedOn: 1
})

describe("HR request contracts", () => {
  it("uses explicit inclusive calendar dates and rejects reversed ranges", () => {
    const valid = Effect.runSync(
      parseCreateHrRequestParams({
        employee: "alice@example.com",
        requestType: "PTO",
        startDate: "2026-09-04",
        endDate: "2026-09-05"
      })
    )
    expect(valid).toMatchObject({ startDate: "2026-09-04", endDate: "2026-09-05" })
    expect(() =>
      Effect.runSync(
        parseCreateHrRequestParams({
          employee: "alice@example.com",
          requestType: "PTO",
          startDate: "2026-09-06",
          endDate: "2026-09-05"
        })
      )
    ).toThrow("startDate must not be after endDate")
    expect(() =>
      Effect.runSync(
        parseCreateHrRequestParams({
          employee: "alice@example.com",
          requestType: "PTO",
          startDate: "2026-02-30",
          endDate: "2026-03-01"
        })
      )
    ).toThrow("real calendar date")
    expect(() =>
      Effect.runSync(
        parseCreateHrRequestParams({
          employee: "alice@example.com",
          requestType: "PTO",
          startDate: "September 4",
          endDate: "2026-09-05"
        })
      )
    ).toThrow("real calendar date")
    expect(
      Effect.runSync(
        parseCreateHrRequestParams({
          employee: "alice@example.com",
          requestType: "PTO",
          startDate: "0001-01-01",
          endDate: "0001-01-01"
        })
      ).startDate
    ).toBe("0001-01-01")
    expect(() => Effect.runSync(parseUpdateHrRequestParams({ request: "request-1" }))).toThrow(
      "at least one update field"
    )
    expect(() =>
      Effect.runSync(
        parseUpdateHrRequestParams({ request: "request-1", startDate: "2026-09-06", endDate: "2026-09-05" })
      )
    ).toThrow("startDate must not be after endDate")
    expect(
      Effect.runSync(parseUpdateHrRequestParams({ request: "request-1", startDate: "2026-09-04" })).startDate
    ).toBe("2026-09-04")
    expect(Effect.runSync(parseUpdateHrRequestParams({ request: "request-1", endDate: "2026-09-05" })).endDate).toBe(
      "2026-09-05"
    )
    expect(
      Effect.runSync(
        parseListHrRequestsParams({
          employee: "employee-1",
          department: "Product",
          requestType: "PTO",
          startOnOrAfter: "2026-09-01",
          endOnOrBefore: "2026-09-30",
          limit: 25,
          offset: 5
        })
      )
    ).toMatchObject({ limit: 25, offset: 5 })
  })

  it("projects human-readable labels and classifies request-type mutation as unsupported", () => {
    expect(toHrRequestTypeSummary(requestType("hr:ids:PTO2", "PTO2"))).toMatchObject({
      label: "PTO/2",
      labelResource: "embedded:embedded:PTO2",
      mutationSupported: false
    })
    expect(toHrRequestTypeSummary(requestType("type-custom", "PersonalDay"))).toMatchObject({
      label: "PersonalDay",
      labelResource: "embedded:embedded:PersonalDay"
    })
  })

  it("resolves exact IDs and labels while rejecting absent and ambiguous labels", () => {
    const types = [requestType("type-1", "PTO"), requestType("type-2", "Remote")]
    expect(Effect.runSync(resolveHrRequestTypeFrom(types, HrRequestTypeIdentifier.make("Remote")))._id).toBe("type-2")
    expect(Effect.runSync(resolveHrRequestTypeFrom(types, HrRequestTypeIdentifier.make("type-1")))._id).toBe("type-1")
    const absent = Effect.runSync(Effect.flip(resolveHrRequestTypeFrom(types, HrRequestTypeIdentifier.make("Sick"))))
    expect(absent).toBeInstanceOf(HrRequestTypeNotFoundError)
    const duplicate = [...types, requestType("type-3", "Remote")]
    const ambiguous = Effect.runSync(
      Effect.flip(resolveHrRequestTypeFrom(duplicate, HrRequestTypeIdentifier.make("Remote")))
    )
    expect(ambiguous).toBeInstanceOf(HrRequestTypeIdentifierAmbiguousError)
    const crossModality = [requestType("Remote", "Vacation"), requestType("type-4", "Remote")]
    expect(
      Effect.runSync(Effect.flip(resolveHrRequestTypeFrom(crossModality, HrRequestTypeIdentifier.make("Remote"))))
    ).toBeInstanceOf(HrRequestTypeIdentifierAmbiguousError)
  })

  it("requires exactly one attachment source", () => {
    const base = { request: "request-1", filename: "note.txt", contentType: "text/plain" }
    expect(Effect.runSync(parseAddHrRequestAttachmentParams({ ...base, data: "aGVsbG8=" })).data).toBe("aGVsbG8=")
    expect(() => Effect.runSync(parseAddHrRequestAttachmentParams(base))).toThrow("exactly one")
    expect(() =>
      Effect.runSync(parseAddHrRequestAttachmentParams({ ...base, data: "aGVsbG8=", filePath: "/tmp/note.txt" }))
    ).toThrow("exactly one")
    expect(Effect.runSync(parseAddHrRequestAttachmentParams({ ...base, filePath: "/tmp/note.txt" })).filePath).toBe(
      "/tmp/note.txt"
    )
    expect(
      Effect.runSync(parseAddHrRequestAttachmentParams({ ...base, fileUrl: "https://example.com/note.txt" })).fileUrl
    ).toBe("https://example.com/note.txt")
    expect(() =>
      Effect.runSync(parseUpdateHrRequestAttachmentParams({ request: "request-1", attachmentId: "attachment-1" }))
    ).toThrow("description and/or pinned")
    expect(
      Effect.runSync(
        parseUpdateHrRequestAttachmentParams({
          request: "request-1",
          attachmentId: "attachment-1",
          description: null,
          pinned: false
        })
      )
    ).toMatchObject({ description: null, pinned: false })
  })
})
