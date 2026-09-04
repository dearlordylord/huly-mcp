import { getEmbeddedLabel } from "@hcengineering/platform"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import {
  HrRequestTypeIdentifier,
  NonEmptyString,
  parseAddHrRequestAttachmentParams,
  parseCreateHrRequestParams,
  parseListHrRequestsParams,
  parseUpdateHrRequestAttachmentParams,
  parseUpdateHrRequestParams
} from "../../../src/domain/schemas.js"
import { ColorCode } from "../../../src/domain/schemas/shared.js"
import {
  HulyDataInvalidError,
  HrRequestTypeIdentifierAmbiguousError,
  HrRequestTypeNotFoundError
} from "../../../src/huly/errors.js"
import { resolveHrRequestTypeFrom, toHrRequestTypeSummary } from "../../../src/huly/operations/hr-requests.js"
import {
  parseHrRequestRecord,
  parseHrRequestTypeRecord,
  parseHrStaffRecord,
  type HrRequestTypeRecord
} from "../../../src/huly/operations/hr-request-sdk-boundary.js"

const requestType = (id: string, label: string): HrRequestTypeRecord => ({
  _id: HrRequestTypeIdentifier.make(id),
  label: NonEmptyString.make(getEmbeddedLabel(label)),
  value: -1,
  color: ColorCode.make(2)
})
const localizedRequestType = (id: string, labelResource: string): HrRequestTypeRecord => ({
  ...requestType(id, "unused"),
  label: NonEmptyString.make(labelResource)
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
    expect(Effect.runSync(toHrRequestTypeSummary(localizedRequestType("hr:ids:PTO2", "hr:string:PTO2")))).toMatchObject(
      { label: "PTO/2", labelLocale: "en", labelResource: "hr:string:PTO2", mutationSupported: false }
    )
    expect(Effect.runSync(toHrRequestTypeSummary(requestType("type-custom", "On-call: weekend")))).toMatchObject({
      label: "On-call: weekend",
      labelResource: "embedded:embedded:On-call: weekend"
    })
    expect(Effect.runSync(toHrRequestTypeSummary(localizedRequestType("type-pto", "hr:string:PTO"), "fr")).label).toBe(
      "Congé payé"
    )
    expect(
      Effect.runSync(toHrRequestTypeSummary(localizedRequestType("type-remote", "hr:string:Remote"), "fr")).label
    ).toBe("Télétravail")
    expect(
      Effect.runSync(toHrRequestTypeSummary(localizedRequestType("type-external", "other:string:OnCall"))).label
    ).toBe("other:string:OnCall")
    expect(
      Effect.runSync(
        Effect.flip(toHrRequestTypeSummary(localizedRequestType("type-missing", "hr:string:MissingLabel"), "fr"))
      )
    ).toBeInstanceOf(HulyDataInvalidError)
    expect(
      Effect.runSync(Effect.flip(toHrRequestTypeSummary(localizedRequestType("type-empty", "embedded:embedded:"))))
    ).toBeInstanceOf(HulyDataInvalidError)
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
    expect(Effect.runSync(resolveHrRequestTypeFrom(crossModality, HrRequestTypeIdentifier.make("Remote")))._id).toBe(
      "Remote"
    )
    const localized = [
      localizedRequestType("type-pto", "hr:string:PTO"),
      localizedRequestType("type-remote", "hr:string:Remote")
    ]
    expect(Effect.runSync(resolveHrRequestTypeFrom(localized, HrRequestTypeIdentifier.make("Congé payé")))._id).toBe(
      "type-pto"
    )
    const duplicateId = [requestType("type-duplicate", "PTO"), requestType("type-duplicate", "Remote")]
    expect(
      Effect.runSync(Effect.flip(resolveHrRequestTypeFrom(duplicateId, HrRequestTypeIdentifier.make("type-duplicate"))))
    ).toBeInstanceOf(HulyDataInvalidError)
  })

  it("rejects corrupt Huly request, request-type, and Staff boundary records", () => {
    const malformedRequestType: unknown = { _id: "type-1", label: "hr:string:PTO", value: -1, color: "red" }
    const malformedRequest: unknown = {
      _id: "request-1",
      space: "workspace",
      attachedTo: "employee-1",
      attachedToClass: "contact:mixin:Employee",
      collection: "requests",
      department: "department-product",
      type: "type-1",
      description: "",
      tzDate: { year: 2026, month: 8, day: "four", offset: 0 },
      tzDueDate: { year: 2026, month: 8, day: 5, offset: 0 }
    }
    const malformedStaff: unknown = { _id: "employee-1", _class: "hr:mixin:Staff", department: "" }
    const staffWithoutDepartment: unknown = { _id: "employee-1", _class: "hr:mixin:Staff" }
    expect(Effect.runSync(Effect.flip(parseHrRequestTypeRecord(malformedRequestType)))).toBeInstanceOf(
      HulyDataInvalidError
    )
    expect(Effect.runSync(Effect.flip(parseHrRequestRecord(malformedRequest)))).toBeInstanceOf(HulyDataInvalidError)
    expect(Effect.runSync(Effect.flip(parseHrStaffRecord(malformedStaff)))).toBeInstanceOf(HulyDataInvalidError)
    expect(Effect.runSync(parseHrStaffRecord(staffWithoutDepartment))).toEqual(staffWithoutDepartment)
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
