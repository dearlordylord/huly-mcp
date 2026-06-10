import { describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"
import {
  AssociationId,
  Count,
  DocId,
  EventId,
  FloorId,
  MeetingMinutesId,
  ObjectClassName,
  RelationId,
  RoomId,
  ScheduleId
} from "../../src/domain/schemas/shared.js"
import {
  ActivityMessageNotFoundError,
  AssociationConflictError,
  AssociationIdentifierAmbiguousError,
  AssociationInUseError,
  AssociationNotFoundError,
  AssociationSystemClassUnsupportedError,
  AttachmentNotFoundError,
  BYTES_PER_MB,
  CalendarNotAccessibleError,
  CannotDirectMessageSelfError,
  CardNotFoundError,
  CardSpaceNotFoundError,
  ChannelNotFoundError,
  CommentNotFoundError,
  ComponentNotFoundError,
  DirectMessageIdentifierAmbiguousError,
  DirectMessageNotFoundError,
  DocumentContentCorruptedError,
  DocumentEditModeError,
  DocumentNotFoundError,
  DocumentReferenceError,
  EventNotFoundError,
  FileFetchError,
  FileNotFoundError,
  FileTooLargeError,
  FileUploadError,
  FloorNotFoundError,
  FunnelNotFoundError,
  GenericObjectIdentifierAmbiguousError,
  GenericObjectLocatorInvalidError,
  GenericObjectNotFoundError,
  HulyAuthError,
  HulyClassNotFoundError,
  HulyConnectionError,
  type HulyDomainError,
  HulyDomainError as HulyDomainErrorSchema,
  HulyError,
  InvalidContactProviderError,
  InvalidContentTypeError,
  InvalidFileDataError,
  InvalidPersonUuidError,
  InvalidStatusError,
  IssueNotFoundError,
  IssueTemplateNotFoundError,
  LeadNotFoundError,
  MasterTagNotFoundError,
  MeetingMinutesNotFoundError,
  MessageNotFoundError,
  MilestoneNotFoundError,
  NotificationContextNotFoundError,
  NotificationNotFoundError,
  NoUpdateFieldsError,
  OrganizationIdentifierAmbiguousError,
  OrganizationNotFoundError,
  PersonIdentifierAmbiguousError,
  PersonNotAnEmployeeError,
  PersonNotFoundError,
  ProjectNotFoundError,
  ReactionNotFoundError,
  RecurringEventNotFoundError,
  RelationCardinalityViolationError,
  RelationDirectionAmbiguousError,
  RelationEndpointClassMismatchError,
  RelationIdentifierAmbiguousError,
  RelationMutationUnsupportedError,
  RelationNotFoundError,
  RoomNotFoundError,
  SavedMessageNotFoundError,
  ScheduleNotFoundError,
  TagCategoryNotFoundError,
  TagNotFoundError,
  TeamspaceNotFoundError,
  TemplateChildNotFoundError,
  TestPlanItemNotFoundError,
  ThreadReplyNotFoundError,
  TodoIdentifierAmbiguousError,
  TodoNotFoundError,
  TodoWorkSlotNotFoundError
} from "../../src/huly/errors.js"
import { funnelIdentifier, funnelReference, leadIdentifier } from "../helpers/brands.js"

describe("Huly Errors", () => {
  describe("HulyError", () => {
    it.effect("creates with message", () =>
      Effect.gen(function*() {
        const error = new HulyError({ message: "Something went wrong" })
        expect(error._tag).toBe("HulyError")
        expect(error.message).toBe("Something went wrong")
      }))

    it.effect("creates with cause", () =>
      Effect.gen(function*() {
        const cause = new Error("underlying error")
        const error = new HulyError({ message: "Wrapped error", cause })
        expect(error.cause).toBe(cause)
      }))
  })

  describe("HulyConnectionError", () => {
    it.effect("creates with message", () =>
      Effect.gen(function*() {
        const error = new HulyConnectionError({ message: "Connection failed" })
        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toBe("Connection failed")
      }))

    it.effect("creates with cause", () =>
      Effect.gen(function*() {
        const cause = new Error("network timeout")
        const error = new HulyConnectionError({ message: "Connection failed", cause })
        expect(error.cause).toBe(cause)
      }))
  })

  describe("HulyAuthError", () => {
    it.effect("creates with message", () =>
      Effect.gen(function*() {
        const error = new HulyAuthError({ message: "Invalid credentials" })
        expect(error._tag).toBe("HulyAuthError")
        expect(error.message).toBe("Invalid credentials")
      }))
  })

  describe("IssueNotFoundError", () => {
    it.effect("creates with identifier and project", () =>
      Effect.gen(function*() {
        const error = new IssueNotFoundError({ identifier: "HULY-123", project: "HULY" })
        expect(error._tag).toBe("IssueNotFoundError")
        expect(error.identifier).toBe("HULY-123")
        expect(error.project).toBe("HULY")
      }))

    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new IssueNotFoundError({ identifier: "HULY-123", project: "HULY" })
        expect(error.message).toBe("Issue 'HULY-123' not found in project 'HULY'")
      }))
  })

  describe("ProjectNotFoundError", () => {
    it.effect("creates with identifier", () =>
      Effect.gen(function*() {
        const error = new ProjectNotFoundError({ identifier: "MISSING" })
        expect(error._tag).toBe("ProjectNotFoundError")
        expect(error.identifier).toBe("MISSING")
      }))

    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new ProjectNotFoundError({ identifier: "MISSING" })
        expect(error.message).toBe("Project 'MISSING' not found")
      }))
  })

  describe("InvalidStatusError", () => {
    it.effect("creates with status and project", () =>
      Effect.gen(function*() {
        const error = new InvalidStatusError({ status: "bogus", project: "HULY" })
        expect(error._tag).toBe("InvalidStatusError")
        expect(error.status).toBe("bogus")
        expect(error.project).toBe("HULY")
      }))

    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new InvalidStatusError({ status: "bogus", project: "HULY" })
        expect(error.message).toBe("Invalid status 'bogus' for project 'HULY'")
      }))
  })

  describe("FileUploadError", () => {
    it.effect("creates with message", () =>
      Effect.gen(function*() {
        const error = new FileUploadError({ message: "Storage quota exceeded" })
        expect(error._tag).toBe("FileUploadError")
        expect(error.message).toBe("Storage quota exceeded")
      }))

    it.effect("creates with cause", () =>
      Effect.gen(function*() {
        const cause = new Error("network error")
        const error = new FileUploadError({ message: "Upload failed", cause })
        expect(error.cause).toBe(cause)
      }))
  })

  describe("InvalidFileDataError", () => {
    it.effect("creates with message", () =>
      Effect.gen(function*() {
        const error = new InvalidFileDataError({ message: "Invalid base64 encoding" })
        expect(error._tag).toBe("InvalidFileDataError")
        expect(error.message).toBe("Invalid base64 encoding")
      }))
  })

  describe("FileNotFoundError", () => {
    it.effect("creates with filePath", () =>
      Effect.gen(function*() {
        const error = new FileNotFoundError({ filePath: "/tmp/missing.txt" })
        expect(error._tag).toBe("FileNotFoundError")
        expect(error.filePath).toBe("/tmp/missing.txt")
        expect(error.message).toBe("File not found: /tmp/missing.txt")
      }))
  })

  describe("FileFetchError", () => {
    it.effect("creates with fileUrl and reason", () =>
      Effect.gen(function*() {
        const error = new FileFetchError({ fileUrl: "https://example.com/img.png", reason: "404 Not Found" })
        expect(error._tag).toBe("FileFetchError")
        expect(error.fileUrl).toBe("https://example.com/img.png")
        expect(error.reason).toBe("404 Not Found")
        expect(error.message).toBe("Failed to fetch file from https://example.com/img.png: 404 Not Found")
      }))
  })

  describe("TeamspaceNotFoundError", () => {
    it.effect("creates with identifier", () =>
      Effect.gen(function*() {
        const error = new TeamspaceNotFoundError({ identifier: "my-teamspace" })
        expect(error._tag).toBe("TeamspaceNotFoundError")
        expect(error.identifier).toBe("my-teamspace")
      }))

    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new TeamspaceNotFoundError({ identifier: "my-teamspace" })
        expect(error.message).toBe("Teamspace 'my-teamspace' not found")
      }))
  })

  describe("DocumentNotFoundError", () => {
    it.effect("creates with identifier and teamspace", () =>
      Effect.gen(function*() {
        const error = new DocumentNotFoundError({ identifier: "doc-1", teamspace: "engineering" })
        expect(error._tag).toBe("DocumentNotFoundError")
        expect(error.identifier).toBe("doc-1")
        expect(error.teamspace).toBe("engineering")
      }))

    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new DocumentNotFoundError({ identifier: "doc-1", teamspace: "engineering" })
        expect(error.message).toBe("Document 'doc-1' not found in teamspace 'engineering'")
      }))
  })

  describe("CommentNotFoundError", () => {
    it.effect("creates with commentId, issueIdentifier, and project", () =>
      Effect.gen(function*() {
        const error = new CommentNotFoundError({ commentId: "c-42", issueIdentifier: "HULY-99", project: "HULY" })
        expect(error._tag).toBe("CommentNotFoundError")
        expect(error.commentId).toBe("c-42")
        expect(error.issueIdentifier).toBe("HULY-99")
        expect(error.project).toBe("HULY")
      }))

    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new CommentNotFoundError({ commentId: "c-42", issueIdentifier: "HULY-99", project: "HULY" })
        expect(error.message).toBe("Comment 'c-42' not found on issue 'HULY-99' in project 'HULY'")
      }))
  })

  describe("MilestoneNotFoundError", () => {
    it.effect("creates with identifier and project", () =>
      Effect.gen(function*() {
        const error = new MilestoneNotFoundError({ identifier: "v1.0", project: "HULY" })
        expect(error._tag).toBe("MilestoneNotFoundError")
        expect(error.identifier).toBe("v1.0")
        expect(error.project).toBe("HULY")
      }))

    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new MilestoneNotFoundError({ identifier: "v1.0", project: "HULY" })
        expect(error.message).toBe("Milestone 'v1.0' not found in project 'HULY'")
      }))
  })

  describe("ChannelNotFoundError", () => {
    it.effect("creates with identifier", () =>
      Effect.gen(function*() {
        const error = new ChannelNotFoundError({ identifier: "general" })
        expect(error._tag).toBe("ChannelNotFoundError")
        expect(error.identifier).toBe("general")
      }))

    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new ChannelNotFoundError({ identifier: "general" })
        expect(error.message).toBe("Channel 'general' not found")
      }))
  })

  describe("DirectMessageNotFoundError", () => {
    it.effect("creates with identifier", () =>
      Effect.gen(function*() {
        const error = new DirectMessageNotFoundError({ identifier: "Kerr,Shannon" })
        expect(error._tag).toBe("DirectMessageNotFoundError")
        expect(error.identifier).toBe("Kerr,Shannon")
      }))

    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new DirectMessageNotFoundError({ identifier: "Kerr,Shannon" })
        expect(error.message).toBe("Direct message 'Kerr,Shannon' not found")
      }))
  })

  describe("DirectMessageIdentifierAmbiguousError", () => {
    it.effect("creates with identifier and match count", () =>
      Effect.gen(function*() {
        const error = new DirectMessageIdentifierAmbiguousError({
          identifier: "Kerr,Shannon",
          matches: Count.make(2)
        })
        expect(error._tag).toBe("DirectMessageIdentifierAmbiguousError")
        expect(error.identifier).toBe("Kerr,Shannon")
        expect(error.matches).toBe(2)
      }))

    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new DirectMessageIdentifierAmbiguousError({
          identifier: "Kerr,Shannon",
          matches: Count.make(2)
        })
        expect(error.message).toBe("Direct message 'Kerr,Shannon' is ambiguous (2 matches); use the DM _id")
      }))
  })

  describe("PersonIdentifierAmbiguousError", () => {
    it.effect("creates with identifier and match count", () =>
      Effect.gen(function*() {
        const error = new PersonIdentifierAmbiguousError({ identifier: "Smith,Bill", matches: Count.make(2) })
        expect(error._tag).toBe("PersonIdentifierAmbiguousError")
        expect(error.identifier).toBe("Smith,Bill")
        expect(error.matches).toBe(2)
      }))

    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new PersonIdentifierAmbiguousError({ identifier: "Smith,Bill", matches: Count.make(2) })
        expect(error.message).toBe(
          "Person identifier 'Smith,Bill' matched 2 people; use an exact email address instead"
        )
      }))
  })

  describe("MessageNotFoundError", () => {
    it.effect("creates with messageId and channel", () =>
      Effect.gen(function*() {
        const error = new MessageNotFoundError({ messageId: "msg-1", channel: "general" })
        expect(error._tag).toBe("MessageNotFoundError")
        expect(error.messageId).toBe("msg-1")
        expect(error.channel).toBe("general")
      }))

    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new MessageNotFoundError({ messageId: "msg-1", channel: "general" })
        expect(error.message).toBe("Message 'msg-1' not found in channel 'general'")
      }))
  })

  describe("ThreadReplyNotFoundError", () => {
    it.effect("creates with replyId and messageId", () =>
      Effect.gen(function*() {
        const error = new ThreadReplyNotFoundError({ replyId: "reply-5", messageId: "msg-1" })
        expect(error._tag).toBe("ThreadReplyNotFoundError")
        expect(error.replyId).toBe("reply-5")
        expect(error.messageId).toBe("msg-1")
      }))

    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new ThreadReplyNotFoundError({ replyId: "reply-5", messageId: "msg-1" })
        expect(error.message).toBe("Thread reply 'reply-5' not found on message 'msg-1'")
      }))
  })

  describe("EventNotFoundError", () => {
    it.effect("creates with eventId", () =>
      Effect.gen(function*() {
        const error = new EventNotFoundError({ eventId: EventId.make("evt-100") })
        expect(error._tag).toBe("EventNotFoundError")
        expect(error.eventId).toBe("evt-100")
      }))

    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new EventNotFoundError({ eventId: EventId.make("evt-100") })
        expect(error.message).toBe("Event 'evt-100' not found")
      }))
  })

  describe("RecurringEventNotFoundError", () => {
    it.effect("creates with eventId", () =>
      Effect.gen(function*() {
        const error = new RecurringEventNotFoundError({ eventId: EventId.make("rec-200") })
        expect(error._tag).toBe("RecurringEventNotFoundError")
        expect(error.eventId).toBe("rec-200")
      }))

    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new RecurringEventNotFoundError({ eventId: EventId.make("rec-200") })
        expect(error.message).toBe("Recurring event 'rec-200' not found")
      }))
  })

  describe("CalendarNotAccessibleError", () => {
    it.effect("creates with calendarId", () =>
      Effect.gen(function*() {
        const error = new CalendarNotAccessibleError({ calendarId: "cal-100" })
        expect(error._tag).toBe("CalendarNotAccessibleError")
        expect(error.calendarId).toBe("cal-100")
      }))

    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new CalendarNotAccessibleError({ calendarId: "cal-100" })
        expect(error.message).toBe("Calendar 'cal-100' not found or not accessible")
      }))
  })

  describe("ScheduleNotFoundError", () => {
    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new ScheduleNotFoundError({ scheduleId: ScheduleId.make("sched-100") })
        expect(error.message).toBe("Schedule 'sched-100' not found")
      }))
  })

  describe("Virtual office errors", () => {
    it.effect("generate messages from fields", () =>
      Effect.gen(function*() {
        expect(new FloorNotFoundError({ floorId: FloorId.make("floor-100") }).message).toBe(
          "Office floor 'floor-100' not found"
        )
        expect(new RoomNotFoundError({ roomId: RoomId.make("room-100") }).message).toBe(
          "Office room 'room-100' not found"
        )
        expect(new MeetingMinutesNotFoundError({ meetingMinutesId: MeetingMinutesId.make("minutes-100") }).message)
          .toBe(
            "Meeting minutes 'minutes-100' not found"
          )
      }))
  })

  describe("ActivityMessageNotFoundError", () => {
    it.effect("creates with messageId", () =>
      Effect.gen(function*() {
        const error = new ActivityMessageNotFoundError({ messageId: "act-10" })
        expect(error._tag).toBe("ActivityMessageNotFoundError")
        expect(error.messageId).toBe("act-10")
      }))

    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new ActivityMessageNotFoundError({ messageId: "act-10" })
        expect(error.message).toBe("Activity message 'act-10' not found")
      }))
  })

  describe("ReactionNotFoundError", () => {
    it.effect("creates with messageId and emoji", () =>
      Effect.gen(function*() {
        const error = new ReactionNotFoundError({ messageId: "msg-7", emoji: "thumbsup" })
        expect(error._tag).toBe("ReactionNotFoundError")
        expect(error.messageId).toBe("msg-7")
        expect(error.emoji).toBe("thumbsup")
      }))

    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new ReactionNotFoundError({ messageId: "msg-7", emoji: "thumbsup" })
        expect(error.message).toBe("Reaction 'thumbsup' not found on message 'msg-7'")
      }))
  })

  describe("SavedMessageNotFoundError", () => {
    it.effect("creates with messageId", () =>
      Effect.gen(function*() {
        const error = new SavedMessageNotFoundError({ messageId: "msg-saved-1" })
        expect(error._tag).toBe("SavedMessageNotFoundError")
        expect(error.messageId).toBe("msg-saved-1")
      }))

    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new SavedMessageNotFoundError({ messageId: "msg-saved-1" })
        expect(error.message).toBe("Saved message for 'msg-saved-1' not found")
      }))
  })

  describe("AttachmentNotFoundError", () => {
    it.effect("creates with attachmentId", () =>
      Effect.gen(function*() {
        const error = new AttachmentNotFoundError({ attachmentId: "att-3" })
        expect(error._tag).toBe("AttachmentNotFoundError")
        expect(error.attachmentId).toBe("att-3")
      }))

    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new AttachmentNotFoundError({ attachmentId: "att-3" })
        expect(error.message).toBe("Attachment 'att-3' not found")
      }))
  })

  describe("ComponentNotFoundError", () => {
    it.effect("creates with identifier and project", () =>
      Effect.gen(function*() {
        const error = new ComponentNotFoundError({ identifier: "frontend", project: "HULY" })
        expect(error._tag).toBe("ComponentNotFoundError")
        expect(error.identifier).toBe("frontend")
        expect(error.project).toBe("HULY")
      }))

    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new ComponentNotFoundError({ identifier: "frontend", project: "HULY" })
        expect(error.message).toBe("Component 'frontend' not found in project 'HULY'")
      }))
  })

  describe("IssueTemplateNotFoundError", () => {
    it.effect("creates with identifier and project", () =>
      Effect.gen(function*() {
        const error = new IssueTemplateNotFoundError({ identifier: "bug-report", project: "HULY" })
        expect(error._tag).toBe("IssueTemplateNotFoundError")
        expect(error.identifier).toBe("bug-report")
        expect(error.project).toBe("HULY")
      }))

    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new IssueTemplateNotFoundError({ identifier: "bug-report", project: "HULY" })
        expect(error.message).toBe("Issue template 'bug-report' not found in project 'HULY'")
      }))
  })

  describe("TemplateChildNotFoundError", () => {
    it.effect("creates with fields", () =>
      Effect.gen(function*() {
        const error = new TemplateChildNotFoundError({ childId: "c-1", template: "tpl-1", project: "HULY" })
        expect(error._tag).toBe("TemplateChildNotFoundError")
        expect(error.childId).toBe("c-1")
        expect(error.template).toBe("tpl-1")
        expect(error.project).toBe("HULY")
      }))

    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new TemplateChildNotFoundError({ childId: "c-1", template: "tpl-1", project: "HULY" })
        expect(error.message).toBe("Child template 'c-1' not found in template 'tpl-1' of project 'HULY'")
      }))
  })

  describe("NotificationNotFoundError", () => {
    it.effect("creates with notificationId", () =>
      Effect.gen(function*() {
        const error = new NotificationNotFoundError({ notificationId: "notif-55" })
        expect(error._tag).toBe("NotificationNotFoundError")
        expect(error.notificationId).toBe("notif-55")
      }))

    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new NotificationNotFoundError({ notificationId: "notif-55" })
        expect(error.message).toBe("Notification 'notif-55' not found")
      }))
  })

  describe("NotificationContextNotFoundError", () => {
    it.effect("creates with contextId", () =>
      Effect.gen(function*() {
        const error = new NotificationContextNotFoundError({ contextId: "ctx-77" })
        expect(error._tag).toBe("NotificationContextNotFoundError")
        expect(error.contextId).toBe("ctx-77")
      }))

    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new NotificationContextNotFoundError({ contextId: "ctx-77" })
        expect(error.message).toBe("Notification context 'ctx-77' not found")
      }))
  })

  describe("InvalidPersonUuidError", () => {
    it.effect("creates with uuid", () =>
      Effect.gen(function*() {
        const error = new InvalidPersonUuidError({ uuid: "not-a-uuid" })
        expect(error._tag).toBe("InvalidPersonUuidError")
        expect(error.uuid).toBe("not-a-uuid")
      }))

    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new InvalidPersonUuidError({ uuid: "not-a-uuid" })
        expect(error.message).toBe("Invalid PersonUuid format: 'not-a-uuid'")
      }))
  })

  describe("FileTooLargeError", () => {
    it.effect("creates with filename, size, and maxSize", () =>
      Effect.gen(function*() {
        const error = new FileTooLargeError({
          filename: "big.zip",
          size: 15 * BYTES_PER_MB,
          maxSize: 10 * BYTES_PER_MB
        })
        expect(error._tag).toBe("FileTooLargeError")
        expect(error.filename).toBe("big.zip")
        expect(error.size).toBe(15 * BYTES_PER_MB)
        expect(error.maxSize).toBe(10 * BYTES_PER_MB)
      }))

    it.effect("generates message with MB conversion", () =>
      Effect.gen(function*() {
        const error = new FileTooLargeError({
          filename: "big.zip",
          size: 15 * BYTES_PER_MB,
          maxSize: 10 * BYTES_PER_MB
        })
        expect(error.message).toBe("File 'big.zip' is too large (15.00MB). Maximum allowed: 10MB")
      }))

    it.effect("formats fractional MB with two decimal places", () =>
      Effect.gen(function*() {
        const error = new FileTooLargeError({
          filename: "photo.jpg",
          size: 5.5 * BYTES_PER_MB,
          maxSize: 5 * BYTES_PER_MB
        })
        expect(error.message).toBe("File 'photo.jpg' is too large (5.50MB). Maximum allowed: 5MB")
      }))
  })

  describe("InvalidContentTypeError", () => {
    it.effect("creates with filename and contentType", () =>
      Effect.gen(function*() {
        const error = new InvalidContentTypeError({ filename: "script.exe", contentType: "application/x-msdownload" })
        expect(error._tag).toBe("InvalidContentTypeError")
        expect(error.filename).toBe("script.exe")
        expect(error.contentType).toBe("application/x-msdownload")
      }))

    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new InvalidContentTypeError({ filename: "script.exe", contentType: "application/x-msdownload" })
        expect(error.message).toBe("Invalid content type 'application/x-msdownload' for file 'script.exe'")
      }))
  })

  describe("BYTES_PER_MB", () => {
    it.effect("equals 1024 * 1024", () =>
      Effect.gen(function*() {
        expect(BYTES_PER_MB).toBe(1048576)
      }))
  })

  describe("HulyDomainError Schema", () => {
    it.effect("decodes a valid error via Schema.Union", () =>
      Effect.gen(function*() {
        const error = new ProjectNotFoundError({ identifier: "X" })
        const decoded = yield* Schema.decode(HulyDomainErrorSchema)(error)
        expect(decoded._tag).toBe("ProjectNotFoundError")
      }))
  })

  describe("Effect integration", () => {
    it.effect("errors are yieldable", () =>
      Effect.gen(function*() {
        const program = Effect.gen(function*() {
          return yield* new IssueNotFoundError({ identifier: "HULY-1", project: "TEST" })
        })

        const error = yield* Effect.flip(program)
        expect(error._tag).toBe("IssueNotFoundError")
      }))

    it.effect("can pattern match with catchTag", () =>
      Effect.gen(function*() {
        const program = Effect.gen(function*() {
          return yield* new IssueNotFoundError({ identifier: "HULY-1", project: "TEST" })
        }).pipe(
          Effect.catchTag("IssueNotFoundError", (e) => Effect.succeed(`Recovered: ${e.identifier}`))
        )

        const result = yield* program
        expect(result).toBe("Recovered: HULY-1")
      }))

    it.effect("can pattern match with Match exhaustive over all error types", () =>
      Effect.gen(function*() {
        // Using switch instead of Match.type to avoid Effect Match inference issues
        // with Schema.TaggedError unions under exactOptionalPropertyTypes: true.
        // The return type annotation ensures exhaustiveness: TypeScript errors if a case is missing.
        const matchError = (error: HulyDomainError): string => {
          switch (error._tag) {
            case "IssueNotFoundError":
              return `issue:${error.identifier}`
            case "ProjectNotFoundError":
              return `project:${error.identifier}`
            case "InvalidStatusError":
              return `status:${error.status}`
            case "PersonNotFoundError":
              return `person:${error.identifier}`
            case "PersonIdentifierAmbiguousError":
              return `person-ambiguous:${error.identifier}:${error.matches}`
            case "OrganizationNotFoundError":
              return `organization:${error.identifier}`
            case "OrganizationIdentifierAmbiguousError":
              return `organization-ambiguous:${error.identifier}:${error.matches}`
            case "InvalidContactProviderError":
              return `contactprovider:${error.provider}`
            case "FileUploadError":
              return `upload:${error.message}`
            case "InvalidFileDataError":
              return `data:${error.message}`
            case "FileNotFoundError":
              return `notfound:${error.filePath}`
            case "FileFetchError":
              return `fetch:${error.fileUrl}`
            case "HulyConnectionError":
              return "connection"
            case "HulyAuthError":
              return "auth"
            case "HulyError":
              return "generic"
            case "TeamspaceNotFoundError":
              return `teamspace:${error.identifier}`
            case "DocumentNotFoundError":
              return `document:${error.identifier}`
            case "DocumentTextNotFoundError":
              return `doctext:${error.searchText}`
            case "DocumentTextMultipleMatchesError":
              return `docmulti:${error.matchCount}`
            case "DocumentEmptyContentError":
              return `docempty:${error.identifier}`
            case "DocumentContentCorruptedError":
              return `doccorrupt:${error.identifier}:${error.causeMessage ?? ""}`
            case "DocumentEditModeError":
              return `doceditmode:${error.reason}`
            case "DocumentReferenceError":
              return `docreference:${error.reason}`
            case "CommentNotFoundError":
              return `comment:${error.commentId}`
            case "MilestoneNotFoundError":
              return `milestone:${error.identifier}`
            case "ChannelNotFoundError":
              return `channel:${error.identifier}`
            case "DirectMessageIdentifierAmbiguousError":
              return `dm-ambiguous:${error.identifier}:${error.matches}`
            case "DirectMessageNotFoundError":
              return `dm:${error.identifier}`
            case "MessageNotFoundError":
              return `message:${error.messageId}`
            case "ThreadReplyNotFoundError":
              return `reply:${error.replyId}`
            case "CalendarNotAccessibleError":
              return `calendar:${error.calendarId}`
            case "EventNotFoundError":
              return `event:${error.eventId}`
            case "RecurringEventNotFoundError":
              return `recurring:${error.eventId}`
            case "ScheduleNotFoundError":
              return `schedule:${error.scheduleId}`
            case "FloorNotFoundError":
              return `floor:${error.floorId}`
            case "RoomNotFoundError":
              return `room:${error.roomId}`
            case "MeetingMinutesNotFoundError":
              return `meeting-minutes:${error.meetingMinutesId}`
            case "ActivityMessageNotFoundError":
              return `activity:${error.messageId}`
            case "ReactionNotFoundError":
              return `reaction:${error.emoji}`
            case "SavedMessageNotFoundError":
              return `saved:${error.messageId}`
            case "AttachmentNotFoundError":
              return `attachment:${error.attachmentId}`
            case "CardSpaceNotFoundError":
              return `cardspace:${error.identifier}`
            case "CardNotFoundError":
              return `card:${error.identifier}`
            case "MasterTagNotFoundError":
              return `mastertag:${error.identifier}`
            case "TagNotFoundError":
              return `tag:${error.identifier}`
            case "TagCategoryNotFoundError":
              return `tagcat:${error.identifier}`
            case "TestProjectNotFoundError":
              return `testproject:${error.identifier}`
            case "TestSuiteNotFoundError":
              return `testsuite:${error.identifier}`
            case "TestCaseNotFoundError":
              return `testcase:${error.identifier}`
            case "TestPlanNotFoundError":
              return `testplan:${error.identifier}`
            case "TestRunNotFoundError":
              return `testrun:${error.identifier}`
            case "TestResultNotFoundError":
              return `testresult:${error.identifier}`
            case "TestPlanItemNotFoundError":
              return `testplanitem:${error.identifier}`
            case "ComponentNotFoundError":
              return `component:${error.identifier}`
            case "CustomFieldNotFoundError":
              return `customfield:${error.identifier}`
            case "CustomFieldObjectNotFoundError":
              return `customfieldobj:${error.objectId}`
            case "IssueTemplateNotFoundError":
              return `template:${error.identifier}`
            case "TemplateChildNotFoundError":
              return `templatechild:${error.childId}`
            case "NotificationNotFoundError":
              return `notification:${error.notificationId}`
            case "NotificationContextNotFoundError":
              return `notifctx:${error.contextId}`
            case "InvalidPersonUuidError":
              return `uuid:${error.uuid}`
            case "FileTooLargeError":
              return `toolarge:${error.filename}`
            case "InvalidContentTypeError":
              return `contenttype:${error.contentType}`
            case "FunnelNotFoundError":
              return `funnel:${error.identifier}`
            case "LeadNotFoundError":
              return `lead:${error.identifier}`
            case "ProcessNotFoundError":
              return `process:${error.identifier}:${error.candidates.length}`
            case "ProcessIdentifierAmbiguousError":
              return `process-ambiguous:${error.identifier}:${error.candidates.length}`
            case "ProcessMasterTagNotFoundError":
              return `process-master-tag:${error.identifier}`
            case "ProcessMasterTagAmbiguousError":
              return `process-master-tag-ambiguous:${error.identifier}:${error.candidates.length}`
            case "ProcessCardIdentifierAmbiguousError":
              return `process-card-ambiguous:${error.identifier}:${error.candidates.length}`
            case "ProcessCardNotFoundError":
              return `process-card:${error.identifier}`
            case "ProcessInitialStateNotFoundError":
              return `process-initial-state:${error.processId}`
            case "ProcessParallelExecutionForbiddenError":
              return `process-parallel-forbidden:${error.processId}:${error.cardId}:${error.activeExecutionId}`
            case "ProcessExecutionNotFoundError":
              return `process-execution:${error.executionId}`
            case "ProcessExecutionNotCancellableError":
              return `process-execution-not-cancellable:${error.executionId}:${error.status}`
            case "AssociationNotFoundError":
              return `association:${error.identifier}`
            case "AssociationIdentifierAmbiguousError":
              return `association-ambiguous:${error.identifier}:${error.candidates.length}`
            case "AssociationSystemClassUnsupportedError":
              return `association-system:${error.operation}:${error.className}`
            case "AssociationConflictError":
              return `association-conflict:${error.associationId}:${error.reason}`
            case "AssociationInUseError":
              return `association-in-use:${error.associationId}:${error.relationCount}:${error.sampleRelationIds.length}`
            case "RelationNotFoundError":
              return `relation:${error.identifier}`
            case "RelationIdentifierAmbiguousError":
              return `relation-ambiguous:${error.identifier}:${error.relationIds.length}`
            case "RelationMutationUnsupportedError":
              return `relation-unsupported:${error.reason}`
            case "RelationCardinalityViolationError":
              return `relation-cardinality:${error.associationId}:${error.cardinality}:${error.reason}`
            case "RelationDirectionAmbiguousError":
              return `relation-direction:${error.associationId}:${error.reason}`
            case "RelationEndpointClassMismatchError":
              return `relation-mismatch:${error.field}:${error.expectedClass}:${error.actualClass}`
            case "GenericObjectIdentifierAmbiguousError":
              return `generic-object-ambiguous:${error.field}:${error.candidates.length}`
            case "GenericObjectLocatorInvalidError":
              return `generic-object-invalid:${error.field}:${error.reason}`
            case "GenericObjectNotFoundError":
              return `generic-object-not-found:${error.field}:${error.identifier}:${error.class ?? ""}`
            case "HulyClassNotFoundError":
              return `huly-class-not-found:${error.classId}`
            case "SpaceNotFoundError":
              return `space:${error.identifier}`
            case "SpaceIdentifierAmbiguousError":
              return `space-ambiguous:${error.identifier}:${error.matches.length}`
            case "SpaceTypeNotFoundError":
              return `space-type:${error.identifier}`
            case "SpaceTypeIdentifierAmbiguousError":
              return `space-type-ambiguous:${error.identifier}:${error.matches.length}`
            case "NoUpdateFieldsError":
              return `no-update-fields:${error.operation}:${error.fields.length}`
            case "CannotDirectMessageSelfError":
              return `dm-self:${error.identifier}`
            case "PersonNotAnEmployeeError":
              return `not-employee:${error.identifier}`
            case "TodoNotFoundError":
              return `todo:${error.locator}`
            case "TodoIdentifierAmbiguousError":
              return `todo-ambiguous:${error.locator}:${error.matches}`
            case "TodoWorkSlotNotFoundError":
              return `todo-workslot:${error.workSlotId}`
            default: {
              const _exhaustive: never = error
              return _exhaustive
            }
          }
        }

        expect(matchError(new IssueNotFoundError({ identifier: "X", project: "Y" }))).toBe("issue:X")
        expect(matchError(new ProjectNotFoundError({ identifier: "Z" }))).toBe("project:Z")
        expect(matchError(new InvalidStatusError({ status: "bad", project: "P" }))).toBe("status:bad")
        expect(matchError(new PersonNotFoundError({ identifier: "john@example.com" }))).toBe("person:john@example.com")
        expect(matchError(new PersonIdentifierAmbiguousError({ identifier: "Smith,Bill", matches: Count.make(2) })))
          .toBe(
            "person-ambiguous:Smith,Bill:2"
          )
        expect(matchError(new TodoNotFoundError({ locator: "{\"todoId\":\"todo-1\"}" }))).toBe(
          "todo:{\"todoId\":\"todo-1\"}"
        )
        expect(new TodoNotFoundError({ locator: "missing" }).message).toBe(
          "Planner ToDo not found for locator: missing"
        )
        expect(matchError(new TodoIdentifierAmbiguousError({ locator: "title:Fix bug", matches: 2 }))).toBe(
          "todo-ambiguous:title:Fix bug:2"
        )
        expect(new TodoIdentifierAmbiguousError({ locator: "title:Fix bug", matches: 2 }).message).toBe(
          "Planner ToDo locator is ambiguous: title:Fix bug matched 2 ToDos"
        )
        expect(matchError(new TodoWorkSlotNotFoundError({ workSlotId: "slot-1" }))).toBe("todo-workslot:slot-1")
        expect(new TodoWorkSlotNotFoundError({ workSlotId: "slot-1" }).message).toBe(
          "Planner ToDo work slot 'slot-1' not found"
        )
        expect(matchError(new OrganizationNotFoundError({ identifier: "Acme" }))).toBe("organization:Acme")
        expect(
          matchError(new OrganizationIdentifierAmbiguousError({ identifier: "Acme", matches: Count.make(2) }))
        ).toBe("organization-ambiguous:Acme:2")
        expect(matchError(new InvalidContactProviderError({ provider: "fax" }))).toBe("contactprovider:fax")
        expect(matchError(new FileUploadError({ message: "quota exceeded" }))).toBe("upload:quota exceeded")
        expect(matchError(new InvalidFileDataError({ message: "bad base64" }))).toBe("data:bad base64")
        expect(matchError(new FileNotFoundError({ filePath: "/path/to/file" }))).toBe("notfound:/path/to/file")
        expect(matchError(new FileFetchError({ fileUrl: "https://example.com/img.png", reason: "404" }))).toBe(
          "fetch:https://example.com/img.png"
        )
        expect(matchError(new HulyConnectionError({ message: "fail" }))).toBe("connection")
        expect(matchError(new HulyAuthError({ message: "denied" }))).toBe("auth")
        expect(matchError(new HulyError({ message: "oops" }))).toBe("generic")
        expect(matchError(new TeamspaceNotFoundError({ identifier: "ts-1" }))).toBe("teamspace:ts-1")
        expect(matchError(new DocumentNotFoundError({ identifier: "doc-1", teamspace: "eng" }))).toBe("document:doc-1")
        expect(
          matchError(new DocumentContentCorruptedError({ identifier: "doc-1", causeMessage: "missing markup blob" }))
        ).toBe("doccorrupt:doc-1:missing markup blob")
        expect(matchError(new DocumentEditModeError({ reason: "bad mode" }))).toBe("doceditmode:bad mode")
        expect(matchError(new DocumentReferenceError({ reason: "bad reference" }))).toBe(
          "docreference:bad reference"
        )
        expect(
          matchError(new CommentNotFoundError({ commentId: "c-1", issueIdentifier: "H-1", project: "P" }))
        ).toBe("comment:c-1")
        expect(matchError(new MilestoneNotFoundError({ identifier: "m-1", project: "P" }))).toBe("milestone:m-1")
        expect(matchError(new ChannelNotFoundError({ identifier: "ch-1" }))).toBe("channel:ch-1")
        expect(matchError(new DirectMessageIdentifierAmbiguousError({ identifier: "dm-1", matches: Count.make(2) })))
          .toBe(
            "dm-ambiguous:dm-1:2"
          )
        expect(matchError(new DirectMessageNotFoundError({ identifier: "dm-1" }))).toBe("dm:dm-1")
        expect(matchError(new MessageNotFoundError({ messageId: "msg-1", channel: "ch-1" }))).toBe("message:msg-1")
        expect(matchError(new ThreadReplyNotFoundError({ replyId: "r-1", messageId: "msg-1" }))).toBe("reply:r-1")
        expect(matchError(new CalendarNotAccessibleError({ calendarId: "cal-1" }))).toBe("calendar:cal-1")
        expect(matchError(new EventNotFoundError({ eventId: EventId.make("e-1") }))).toBe("event:e-1")
        expect(matchError(new RecurringEventNotFoundError({ eventId: EventId.make("re-1") }))).toBe("recurring:re-1")
        expect(matchError(new ActivityMessageNotFoundError({ messageId: "am-1" }))).toBe("activity:am-1")
        expect(matchError(new ReactionNotFoundError({ messageId: "msg-1", emoji: "heart" }))).toBe("reaction:heart")
        expect(matchError(new SavedMessageNotFoundError({ messageId: "sm-1" }))).toBe("saved:sm-1")
        expect(matchError(new AttachmentNotFoundError({ attachmentId: "att-1" }))).toBe("attachment:att-1")
        expect(matchError(new CardSpaceNotFoundError({ identifier: "cs-1" }))).toBe("cardspace:cs-1")
        expect(matchError(new CardNotFoundError({ identifier: "card-1", cardSpace: "cs-1" }))).toBe("card:card-1")
        expect(
          matchError(new MasterTagNotFoundError({ identifier: "mt-1", cardSpace: "cs-1" }))
        ).toBe("mastertag:mt-1")
        expect(matchError(new TagNotFoundError({ identifier: "lbl-1" }))).toBe("tag:lbl-1")
        expect(matchError(new TagCategoryNotFoundError({ identifier: "cat-1" }))).toBe("tagcat:cat-1")
        expect(
          matchError(new TestPlanItemNotFoundError({ identifier: "item-1", plan: "plan-1" }))
        ).toBe("testplanitem:item-1")
        expect(matchError(new ComponentNotFoundError({ identifier: "cmp-1", project: "P" }))).toBe("component:cmp-1")
        expect(matchError(new IssueTemplateNotFoundError({ identifier: "tpl-1", project: "P" }))).toBe("template:tpl-1")
        expect(
          matchError(new TemplateChildNotFoundError({ childId: "c-1", template: "tpl-1", project: "P" }))
        ).toBe("templatechild:c-1")
        expect(matchError(new NotificationNotFoundError({ notificationId: "n-1" }))).toBe("notification:n-1")
        expect(matchError(new NotificationContextNotFoundError({ contextId: "nc-1" }))).toBe("notifctx:nc-1")
        expect(matchError(new InvalidPersonUuidError({ uuid: "bad-uuid" }))).toBe("uuid:bad-uuid")
        expect(
          matchError(
            new FileTooLargeError({ filename: "big.zip", size: 15 * BYTES_PER_MB, maxSize: 10 * BYTES_PER_MB })
          )
        ).toBe("toolarge:big.zip")
        expect(
          matchError(new InvalidContentTypeError({ filename: "f.exe", contentType: "application/x-msdownload" }))
        ).toBe("contenttype:application/x-msdownload")
        expect(matchError(new FunnelNotFoundError({ identifier: funnelReference("SALES") }))).toBe("funnel:SALES")
        expect(
          matchError(
            new LeadNotFoundError({ identifier: leadIdentifier("LEAD-1"), funnel: funnelIdentifier("funnel-1") })
          )
        ).toBe("lead:LEAD-1")
        expect(matchError(new AssociationNotFoundError({ identifier: "blocks" }))).toBe("association:blocks")
        expect(
          matchError(
            new AssociationIdentifierAmbiguousError({
              identifier: "links",
              candidates: [{ id: AssociationId.make("assoc-1") }, { id: AssociationId.make("assoc-2") }]
            })
          )
        ).toBe("association-ambiguous:links:2")
        expect(
          matchError(
            new AssociationSystemClassUnsupportedError({
              className: ObjectClassName.make("core:class:Doc"),
              operation: "create_relation"
            })
          )
        ).toBe("association-system:create_relation:core:class:Doc")
        expect(
          matchError(
            new AssociationConflictError({
              associationId: AssociationId.make("assoc-1"),
              reason: "different cardinality"
            })
          )
        ).toBe("association-conflict:assoc-1:different cardinality")
        expect(
          matchError(
            new AssociationInUseError({
              associationId: AssociationId.make("assoc-1"),
              relationCount: Count.make(2),
              sampleRelationIds: [RelationId.make("rel-1"), RelationId.make("rel-2")]
            })
          )
        ).toBe("association-in-use:assoc-1:2:2")
        expect(matchError(new RelationNotFoundError({ identifier: "rel-1" }))).toBe("relation:rel-1")
        expect(
          matchError(
            new RelationIdentifierAmbiguousError({
              identifier: "triple",
              relationIds: [RelationId.make("rel-1"), RelationId.make("rel-2")]
            })
          )
        ).toBe("relation-ambiguous:triple:2")
        expect(
          matchError(new RelationMutationUnsupportedError({ reason: "not validated" }))
        ).toBe("relation-unsupported:not validated")
        expect(
          matchError(
            new RelationCardinalityViolationError({
              associationId: AssociationId.make("assoc-1"),
              cardinality: "one-to-one",
              reason: "already linked"
            })
          )
        ).toBe("relation-cardinality:assoc-1:one-to-one:already linked")
        expect(
          matchError(
            new RelationDirectionAmbiguousError({
              associationId: AssociationId.make("assoc-1"),
              reason: "same class"
            })
          )
        ).toBe("relation-direction:assoc-1:same class")
        expect(
          matchError(
            new RelationEndpointClassMismatchError({
              field: "source",
              expectedClass: "tracker:class:Issue",
              actualClass: "document:class:Document"
            })
          )
        ).toBe("relation-mismatch:source:tracker:class:Issue:document:class:Document")
        expect(
          matchError(
            new GenericObjectIdentifierAmbiguousError({
              field: "source",
              identifier: "Spec",
              candidates: [{
                id: DocId.make("doc-1"),
                class: ObjectClassName.make("document:class:Document"),
                display: "Spec"
              }]
            })
          )
        ).toBe("generic-object-ambiguous:source:1")
        expect(
          matchError(
            new GenericObjectLocatorInvalidError({ field: "source", reason: "raw object locator requires class" })
          )
        ).toBe("generic-object-invalid:source:raw object locator requires class")
        expect(
          matchError(
            new GenericObjectNotFoundError({
              field: "target",
              identifier: "missing-doc",
              class: "document:class:Document"
            })
          )
        ).toBe("generic-object-not-found:target:missing-doc:document:class:Document")
        expect(matchError(new HulyClassNotFoundError({ classId: ObjectClassName.make("missing:class:Thing") }))).toBe(
          "huly-class-not-found:missing:class:Thing"
        )
        expect(matchError(new NoUpdateFieldsError({ operation: "update_issue", fields: ["title"] }))).toBe(
          "no-update-fields:update_issue:1"
        )
        expect(matchError(new CannotDirectMessageSelfError({ identifier: "Self,User" }))).toBe("dm-self:Self,User")
        expect(matchError(new PersonNotAnEmployeeError({ identifier: "Ext,Contact" }))).toBe("not-employee:Ext,Contact")
        expect(matchError(new ScheduleNotFoundError({ scheduleId: ScheduleId.make("sched-1") }))).toBe(
          "schedule:sched-1"
        )
        expect(matchError(new FloorNotFoundError({ floorId: FloorId.make("floor-1") }))).toBe("floor:floor-1")
        expect(matchError(new RoomNotFoundError({ roomId: RoomId.make("room-1") }))).toBe("room:room-1")
        expect(matchError(new MeetingMinutesNotFoundError({ meetingMinutesId: MeetingMinutesId.make("minutes-1") })))
          .toBe(
            "meeting-minutes:minutes-1"
          )
      }))
  })
})
