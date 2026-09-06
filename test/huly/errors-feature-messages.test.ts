import { describe, expect, it } from "vitest"

import { CalendarName } from "../../src/domain/schemas/calendar.js"
import { PersonLocator } from "../../src/domain/schemas/hr-departments.js"
import { HrCalendarDate, HrRequestId, HrRequestTypeIdentifier } from "../../src/domain/schemas/hr-requests.js"
import {
  CalendarId,
  CommentId,
  Count,
  CustomFieldId,
  DocumentIdentifier,
  ObjectClassName,
  PersonId,
  RoomId,
  TeamspaceIdentifier
} from "../../src/domain/schemas/shared.js"
import { FloorIdentifier } from "../../src/domain/schemas/virtual-office-administration.js"
import {
  CalendarSettingsIdentifierAmbiguousError,
  CalendarSettingsInternalCalendarHideError,
  CalendarSettingsTargetNotAccessibleError,
  CustomFieldMetadataMalformedError,
  DepartmentImpactMismatchError,
  EmployeeNotFoundError,
  HrRequestCommentNotFoundError,
  HrRequestDateRangeError,
  HrRequestMutationUnsupportedError,
  HrRequestNotFoundError,
  HrRequestTypeIdentifierAmbiguousError,
  HrRequestTypeNotFoundError,
  HrStaffNotFoundError,
  InvalidCustomFieldEnumValueError,
  OfficeFloorIdentifierAmbiguousError,
  OfficeFloorNotFoundError,
  OfficeRoomAccessUnsupportedError,
  OfficeRoomProtectedError,
  OfficeSettingsMalformedError,
  RecruitingCandidateCustomFieldOwnerError,
  RecruitingCandidateCustomFieldTypeUnsupportedError,
  TodoDocumentTargetAmbiguousError,
  TodoDocumentTargetNotWritableError
} from "../../src/huly/errors.js"

describe("feature error messages", () => {
  it("renders both calendar settings locator forms and calendar metadata", () => {
    const byId = new CalendarSettingsTargetNotAccessibleError({ target: { calendarId: CalendarId.make("calendar-1") } })
    const byName = new CalendarSettingsTargetNotAccessibleError({
      target: { calendarName: CalendarName.make("Personal") }
    })
    const ambiguous = new CalendarSettingsIdentifierAmbiguousError({
      calendarName: CalendarName.make("Personal"),
      matches: Count.make(2)
    })

    expect(byId.message).toBe("Calendar 'calendar-1' was not found among the caller's calendars")
    expect(byName.message).toBe("Calendar named 'Personal' was not found among the caller's calendars")
    expect(ambiguous.identifier).toBe("Personal")
    expect(ambiguous.message).toBe("Calendar name 'Personal' matched 2 caller calendars; use calendarId")
    expect(new CalendarSettingsInternalCalendarHideError({ calendarId: CalendarId.make("calendar-1") }).message).toBe(
      "Internal calendar 'calendar-1' cannot be hidden"
    )
  })

  it("renders planner document scope and write-restriction variants", () => {
    const teamspaceAmbiguity = new TodoDocumentTargetAmbiguousError({
      target: { type: "teamspace", identifier: TeamspaceIdentifier.make("Engineering") },
      matches: Count.make(2)
    })
    const documentAmbiguity = new TodoDocumentTargetAmbiguousError({
      target: {
        type: "document",
        identifier: DocumentIdentifier.make("Architecture"),
        teamspace: TeamspaceIdentifier.make("Engineering")
      },
      matches: Count.make(3)
    })
    const locked = new TodoDocumentTargetNotWritableError({
      teamspace: TeamspaceIdentifier.make("Engineering"),
      document: DocumentIdentifier.make("Architecture"),
      reason: "locked"
    })
    const notMember = new TodoDocumentTargetNotWritableError({
      teamspace: TeamspaceIdentifier.make("Engineering"),
      document: DocumentIdentifier.make("Architecture"),
      reason: "not-member"
    })

    expect(teamspaceAmbiguity.message).toBe(
      "Document ToDo teamspace 'Engineering' is ambiguous; 2 matches found. Use an exact ID."
    )
    expect(documentAmbiguity.message).toBe(
      "Document ToDo document 'Architecture' is ambiguous in teamspace 'Engineering'; 3 matches found. Use an exact ID."
    )
    expect(locked.message).toBe("Document ToDo target 'Architecture' in teamspace 'Engineering' is currently locked.")
    expect(notMember.message).toBe(
      "Document ToDo target 'Architecture' in teamspace 'Engineering' is not writable by the authenticated account."
    )
  })

  it("renders virtual-office administration failures", () => {
    expect(new OfficeFloorNotFoundError({ identifier: FloorIdentifier.make("Main") }).message).toBe(
      "Office floor 'Main' not found"
    )
    expect(
      new OfficeFloorIdentifierAmbiguousError({ identifier: FloorIdentifier.make("Main"), matches: Count.make(2) })
        .message
    ).toBe("Office floor identifier 'Main' matched 2 floors; use floor ID")
    expect(new OfficeRoomProtectedError({ roomId: RoomId.make("reception"), field: "name" }).message).toBe(
      "Office room 'reception' is a native protected room whose name cannot be changed"
    )
    expect(new OfficeRoomAccessUnsupportedError({ roomId: RoomId.make("office-1"), access: "open" }).message).toBe(
      "Office room 'office-1' is a personal office and does not support 'open' access"
    )
    expect(
      new OfficeSettingsMalformedError({ reason: "recording and transcription defaults must be boolean values" })
        .message
    ).toBe("Virtual-office settings are malformed: recording and transcription defaults must be boolean values")
  })

  it("renders recruiting custom-field failures, including an enum with no allowed values", () => {
    expect(new CustomFieldMetadataMalformedError({ identifier: "field-1", reason: "missing type" }).message).toBe(
      "Custom field metadata 'field-1' is malformed: missing type"
    )
    expect(
      new InvalidCustomFieldEnumValueError({
        fieldId: CustomFieldId.make("priority"),
        enumRef: "enum:priority",
        value: "Urgent",
        allowedValues: []
      }).message
    ).toBe("Invalid enum custom-field value 'Urgent' for 'priority'. Expected one of: no values.")
    expect(
      new RecruitingCandidateCustomFieldOwnerError({
        fieldId: CustomFieldId.make("priority"),
        ownerClassId: ObjectClassName.make("tracker:class:Issue")
      }).message
    ).toBe(
      "Custom field 'priority' is owned by 'tracker:class:Issue', but Recruiting Candidate fields must be owned by recruit:mixin:Candidate or contact:class:Person"
    )
    expect(
      new RecruitingCandidateCustomFieldTypeUnsupportedError({ fieldId: CustomFieldId.make("watchers"), type: "array" })
        .message
    ).toBe(
      "Recruiting Candidate custom field 'watchers' has unsupported type 'array'; array, ref, and unknown fields cannot be written"
    )
  })

  it("renders HR impact, identity, request, date, comment, and capability failures", () => {
    expect(
      new DepartmentImpactMismatchError({
        expectedSubdepartments: Count.make(1),
        actualSubdepartments: Count.make(2),
        expectedAssignedStaff: Count.make(3),
        actualAssignedStaff: Count.make(4)
      }).message
    ).toBe("Department impact changed: expected 1 subdepartments and 3 assigned staff, found 2 and 4; preview again")
    expect(new EmployeeNotFoundError({ identifier: PersonLocator.make("missing@example.com") }).message).toBe(
      "Employee 'missing@example.com' not found"
    )
    expect(new HrStaffNotFoundError({ employee: PersonId.make("person-1") }).message).toBe(
      "Employee 'person-1' has no HR Staff record; assign the employee to an HR department before creating a request"
    )
    expect(new HrRequestNotFoundError({ request: HrRequestId.make("request-1") }).message).toBe(
      "HR request 'request-1' not found"
    )
    expect(new HrRequestTypeNotFoundError({ requestType: HrRequestTypeIdentifier.make("Vacation") }).message).toBe(
      "HR request type 'Vacation' not found; use an exact ID or label from list_hr_request_types"
    )
    expect(
      new HrRequestTypeIdentifierAmbiguousError({
        requestType: HrRequestTypeIdentifier.make("Vacation"),
        matches: Count.make(2)
      }).message
    ).toBe("HR request type 'Vacation' matched 2 types; use the exact request-type ID")
    expect(
      new HrRequestDateRangeError({
        startDate: HrCalendarDate.make("2026-09-06"),
        endDate: HrCalendarDate.make("2026-09-05")
      }).message
    ).toBe("HR request startDate '2026-09-06' must not be after endDate '2026-09-05'")
    expect(
      new HrRequestCommentNotFoundError({
        request: HrRequestId.make("request-1"),
        commentId: CommentId.make("comment-1")
      }).message
    ).toBe("Comment 'comment-1' not found on HR request 'request-1'")
    expect(new HrRequestMutationUnsupportedError({ operation: "attachment deletion" }).message).toBe(
      "HR request attachment deletion is unavailable because the connected Huly client does not expose the required attached-collection operation"
    )
  })
})
