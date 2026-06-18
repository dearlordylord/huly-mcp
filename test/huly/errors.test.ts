import { describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"
import {
  MessageTemplateCategoryIdentifier,
  MessageTemplateIdentifier,
  TemplateFieldCategoryIdentifier
} from "../../src/domain/schemas/message-templates.js"
import {
  ApplicantIdentifier,
  ApplicantMatchIdentifier,
  CandidateIdentifier,
  OpinionIdentifier,
  ReviewIdentifier,
  VacancyIdentifier
} from "../../src/domain/schemas/recruiting.js"
import {
  AssociationId,
  AttachmentId,
  CommentId,
  Count,
  DocId,
  EventId,
  FloorId,
  IssueIdentifier,
  MeetingMinutesId,
  NonEmptyString,
  ObjectClassName,
  RelationId,
  RoleId,
  RoomId,
  ScheduleId,
  SpaceId,
  SpaceTypeId
} from "../../src/domain/schemas/shared.js"
import {
  ActivityMessageNotFoundError,
  AssociationConflictError,
  AssociationIdentifierAmbiguousError,
  AssociationInUseError,
  AssociationNotFoundError,
  AssociationSystemClassUnsupportedError,
  AttachmentNotFoundError,
  BoardArchivedCardDeleteError,
  BoardCardIdentifierAmbiguousError,
  BoardCardNotFoundError,
  BoardIdentifierAmbiguousError,
  BoardModelSequenceMissingError,
  BoardMutationUnsupportedError,
  BoardNotFoundError,
  BoardProjectTypeIdentifierAmbiguousError,
  BoardProjectTypeNotFoundError,
  BoardStatusIdentifierAmbiguousError,
  BoardStatusNotFoundError,
  BoardTaskTypeIdentifierAmbiguousError,
  BoardTaskTypeNotFoundError,
  BYTES_PER_MB,
  CalendarNotAccessibleError,
  CannotDirectMessageSelfError,
  CardNotFoundError,
  CardSpaceNotFoundError,
  ChannelArchivedError,
  ChannelLastMemberRemovalError,
  ChannelLastOwnerRemovalError,
  ChannelNotFoundError,
  ChatMessageAttachmentNotFoundError,
  CommentNotFoundError,
  ComponentNotFoundError,
  ContactChannelConflictError,
  ContactChannelIdentifierAmbiguousError,
  ContactChannelNotFoundError,
  DirectMessageIdentifierAmbiguousError,
  DirectMessageNotFoundError,
  DirectMessageParticipantCountError,
  DocumentContentCorruptedError,
  DocumentEditModeError,
  DocumentNotFoundError,
  DocumentReferenceError,
  DrawingNotFoundError,
  DriveFileCommentNotFoundError,
  DriveFileNotFoundError,
  DriveFileVersionNotFoundError,
  DriveFolderNotEmptyError,
  DriveIdentifierAmbiguousError,
  DriveInvalidItemOperationError,
  DriveInvalidMoveError,
  DriveNotEmptyError,
  DriveNotFoundError,
  DriveParentNotFolderError,
  DrivePathAmbiguousError,
  DrivePathConflictError,
  DrivePathNotFoundError,
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
  InvalidContactChannelLocatorError,
  InvalidContactChannelValueError,
  InvalidContactProviderError,
  InvalidContentTypeError,
  InvalidFileDataError,
  InvalidPersonUuidError,
  InvalidStatusError,
  InventoryCategoryIdentifierAmbiguousError,
  InventoryCategoryNotFoundError,
  InventoryConflictError,
  InventoryMutationUnsupportedError,
  InventoryNotEmptyError,
  InventoryProductCommentNotFoundError,
  InventoryProductIdentifierAmbiguousError,
  InventoryProductNotFoundError,
  InventoryVariantIdentifierAmbiguousError,
  InventoryVariantNotFoundError,
  IssueNotFoundError,
  IssueTemplateNotFoundError,
  LeadNotFoundError,
  MasterTagNotFoundError,
  MeetingMinutesNotFoundError,
  MessageNotFoundError,
  MessageTemplateCategoryIdentifierAmbiguousError,
  MessageTemplateCategoryNotFoundError,
  MessageTemplateIdentifierAmbiguousError,
  MessageTemplateNotFoundError,
  MilestoneNotFoundError,
  NotificationContextNotFoundError,
  NotificationNotFoundError,
  NotificationPersonSpaceNotFoundError,
  NotificationProviderNotConfigurableError,
  NotificationTypeNotFoundError,
  NoUpdateFieldsError,
  OrganizationIdentifierAmbiguousError,
  OrganizationNotFoundError,
  PersonIdentifierAmbiguousError,
  PersonNotAnEmployeeError,
  PersonNotFoundError,
  ProjectNotFoundError,
  ReactionNotFoundError,
  RecruitingApplicantIdentifierAmbiguousError,
  RecruitingApplicantMatchNotFoundError,
  RecruitingApplicantNotFoundError,
  RecruitingAttachmentNotFoundError,
  RecruitingCandidateNotFoundError,
  RecruitingCommentNotFoundError,
  RecruitingDuplicateApplicantError,
  RecruitingIssueLocatorInvalidError,
  RecruitingModelMissingError,
  RecruitingMutationUnsupportedError,
  RecruitingOpinionIdentifierAmbiguousError,
  RecruitingOpinionNotFoundError,
  RecruitingReviewIdentifierAmbiguousError,
  RecruitingReviewNotFoundError,
  RecruitingVacancyIdentifierAmbiguousError,
  RecruitingVacancyNotFoundError,
  RecruitingVacancyTypeNotFoundError,
  RecurringEventNotFoundError,
  RelationCardinalityViolationError,
  RelationDirectionAmbiguousError,
  RelationEndpointClassMismatchError,
  RelationIdentifierAmbiguousError,
  RelationMutationUnsupportedError,
  RelationNotFoundError,
  RoomNotFoundError,
  SavedAttachmentNotFoundError,
  SavedMessageNotFoundError,
  ScheduleNotFoundError,
  SpaceNotTypedError,
  SpaceRoleAssignmentsMalformedError,
  SpaceRoleIdentifierAmbiguousError,
  SpaceRoleNotFoundError,
  TagCategoryNotFoundError,
  TagNotFoundError,
  TeamspaceNotFoundError,
  TemplateChildNotFoundError,
  TemplateFieldCategoryIdentifierAmbiguousError,
  TemplateFieldCategoryNotFoundError,
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

  describe("Board errors", () => {
    it.effect("generates board-specific messages", () =>
      Effect.gen(function*() {
        expect(new BoardNotFoundError({ identifier: "Roadmap" }).message).toBe("Board 'Roadmap' not found")
        expect(new BoardIdentifierAmbiguousError({ identifier: "Roadmap", matches: 2 }).message).toBe(
          "Board 'Roadmap' matched 2 boards; pass a board _id instead"
        )
        expect(new BoardCardNotFoundError({ board: "Roadmap", identifier: "CARD-1" }).message).toBe(
          "Board card 'CARD-1' not found on board 'Roadmap'"
        )
        expect(
          new BoardCardIdentifierAmbiguousError({ board: "Roadmap", identifier: "Planning", matches: 2 }).message
        ).toBe("Board card 'Planning' matched 2 cards on board 'Roadmap'; pass a card _id")
        expect(new BoardProjectTypeNotFoundError({ identifier: "Kanban" }).message).toBe(
          "Board project type 'Kanban' not found"
        )
        expect(new BoardProjectTypeIdentifierAmbiguousError({ identifier: "Kanban", matches: 2 }).message).toBe(
          "Board project type 'Kanban' matched 2 project types; pass a project type _id"
        )
        expect(new BoardTaskTypeNotFoundError({ board: "Roadmap", identifier: "Card" }).message).toBe(
          "Board task type 'Card' not found for board 'Roadmap'"
        )
        expect(
          new BoardTaskTypeIdentifierAmbiguousError({ board: "Roadmap", identifier: "Card", matches: 2 }).message
        ).toBe("Board task type 'Card' matched 2 task types for board 'Roadmap'; pass a task type _id")
        expect(new BoardStatusNotFoundError({ board: "Roadmap", identifier: "Todo" }).message).toBe(
          "Board status 'Todo' not found for board 'Roadmap'"
        )
        expect(
          new BoardStatusIdentifierAmbiguousError({ board: "Roadmap", identifier: "Todo", matches: 2 }).message
        ).toBe("Board status 'Todo' matched 2 statuses for board 'Roadmap'; pass a status _id")
        expect(new BoardModelSequenceMissingError({ cardClass: "board:class:Card" }).message).toBe(
          "Board model sequence for 'board:class:Card' is missing"
        )
        expect(new BoardArchivedCardDeleteError({ board: "Roadmap", identifier: "CARD-1" }).message).toBe(
          "Board card 'CARD-1' on board 'Roadmap' must be archived before delete_board_card"
        )
        expect(new BoardMutationUnsupportedError({ message: "removeCollection missing" }).message).toBe(
          "removeCollection missing"
        )
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
            case "ContactChannelNotFoundError":
              return `contact-channel:${error.ownerIdentifier}:${error.channelIdentifier}`
            case "ContactChannelIdentifierAmbiguousError":
              return `contact-channel-ambiguous:${error.ownerIdentifier}:${error.channelIdentifier}:${error.matches}`
            case "ContactChannelConflictError":
              return `contact-channel-conflict:${error.ownerIdentifier}:${error.provider}:${error.value}`
            case "InvalidContactChannelLocatorError":
              return `contact-channel-locator:${error.ownerIdentifier}:${error.reason}`
            case "InvalidContactChannelValueError":
              return `contact-channel-value:${error.provider}:${error.value}`
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
            case "ChannelArchivedError":
              return `channel-archived:${error.channel}`
            case "ChannelLastMemberRemovalError":
              return `channel-last-member:${error.channel}`
            case "ChannelLastOwnerRemovalError":
              return `channel-last-owner:${error.channel}`
            case "DirectMessageIdentifierAmbiguousError":
              return `dm-ambiguous:${error.identifier}:${error.matches}`
            case "DirectMessageNotFoundError":
              return `dm:${error.identifier}`
            case "DirectMessageParticipantCountError":
              return `dm-participant-count:${error.requested}:${error.nonSelfParticipants}`
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
            case "SavedAttachmentNotFoundError":
              return `saved-attachment:${error.attachmentId}`
            case "DrawingNotFoundError":
              return `drawing:${error.drawingId}`
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
            case "NotificationPersonSpaceNotFoundError":
              return `notif-person-space:${error.user}`
            case "NotificationTypeNotFoundError":
              return `notiftype:${error.typeId}`
            case "NotificationProviderNotConfigurableError":
              return `notif-provider-not-configurable:${error.providerId}:${error.typeId}`
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
            case "InventoryCategoryNotFoundError":
              return `inventory-category:${error.identifier}`
            case "InventoryProductNotFoundError":
              return `inventory-product:${error.identifier}`
            case "InventoryVariantNotFoundError":
              return `inventory-variant:${error.identifier}`
            case "InventoryCategoryIdentifierAmbiguousError":
              return `inventory-category-ambiguous:${error.identifier}:${error.matches}`
            case "InventoryProductIdentifierAmbiguousError":
              return `inventory-product-ambiguous:${error.identifier}:${error.matches}`
            case "InventoryProductCommentNotFoundError":
              return `inventory-product-comment:${error.product}:${error.commentId}`
            case "InventoryVariantIdentifierAmbiguousError":
              return `inventory-variant-ambiguous:${error.identifier}:${error.matches}`
            case "InventoryConflictError":
              return `inventory-conflict:${error.message}`
            case "InventoryNotEmptyError":
              return `inventory-not-empty:${error.message}`
            case "InventoryMutationUnsupportedError":
              return `inventory-mutation-unsupported:${error.message}`
            case "SpaceNotFoundError":
              return `space:${error.identifier}`
            case "SpaceIdentifierAmbiguousError":
              return `space-ambiguous:${error.identifier}:${error.matches.length}`
            case "SpaceTypeNotFoundError":
              return `space-type:${error.identifier}`
            case "SpaceTypeIdentifierAmbiguousError":
              return `space-type-ambiguous:${error.identifier}:${error.matches.length}`
            case "SpaceNotTypedError":
              return `space-not-typed:${error.id}:${error.name}`
            case "SpaceRoleNotFoundError":
              return `space-role:${error.identifier}:${error.spaceType}`
            case "SpaceRoleIdentifierAmbiguousError":
              return `space-role-ambiguous:${error.identifier}:${error.spaceType}:${error.matches.length}`
            case "SpaceRoleAssignmentsMalformedError":
              return `space-role-assignments-malformed:${error.space}:${error.spaceType}:${error.targetClass}`
            case "RecruitingVacancyNotFoundError":
              return `recruiting-vacancy:${error.identifier}`
            case "RecruitingVacancyIdentifierAmbiguousError":
              return `recruiting-vacancy-ambiguous:${error.identifier}:${error.matches}`
            case "RecruitingVacancyTypeNotFoundError":
              return `recruiting-vacancy-type:${error.identifier}`
            case "RecruitingCandidateNotFoundError":
              return `recruiting-candidate:${error.identifier}`
            case "RecruitingApplicantNotFoundError":
              return `recruiting-applicant:${error.identifier}`
            case "RecruitingApplicantIdentifierAmbiguousError":
              return `recruiting-applicant-ambiguous:${error.identifier}:${error.matches}`
            case "RecruitingDuplicateApplicantError":
              return `recruiting-applicant-duplicate:${error.vacancy}:${error.candidate}`
            case "RecruitingIssueLocatorInvalidError":
              return `recruiting-issue-invalid:${error.issue}:${error.reason}`
            case "RecruitingReviewNotFoundError":
              return `recruiting-review:${error.identifier}`
            case "RecruitingReviewIdentifierAmbiguousError":
              return `recruiting-review-ambiguous:${error.identifier}:${error.matches}`
            case "RecruitingOpinionNotFoundError":
              return `recruiting-opinion:${error.identifier}`
            case "RecruitingOpinionIdentifierAmbiguousError":
              return `recruiting-opinion-ambiguous:${error.identifier}:${error.matches}`
            case "RecruitingApplicantMatchNotFoundError":
              return `recruiting-applicant-match:${error.identifier}`
            case "RecruitingModelMissingError":
              return `recruiting-model-missing:${error.message}`
            case "RecruitingMutationUnsupportedError":
              return `recruiting-mutation-unsupported:${error.message}`
            case "RecruitingCommentNotFoundError":
              return `recruiting-comment:${error.target}:${error.commentId}`
            case "RecruitingAttachmentNotFoundError":
              return `recruiting-attachment:${error.target}:${error.attachmentId}`
            case "ChatMessageAttachmentNotFoundError":
              return `chat-attachment:${error.target}:${error.attachmentId}`
            case "BoardNotFoundError":
              return `board:${error.identifier}`
            case "BoardIdentifierAmbiguousError":
              return `board-ambiguous:${error.identifier}:${error.matches}`
            case "BoardCardNotFoundError":
              return `board-card:${error.board}:${error.identifier}`
            case "BoardCardIdentifierAmbiguousError":
              return `board-card-ambiguous:${error.board}:${error.identifier}:${error.matches}`
            case "BoardProjectTypeNotFoundError":
              return `board-project-type:${error.identifier}`
            case "BoardProjectTypeIdentifierAmbiguousError":
              return `board-project-type-ambiguous:${error.identifier}:${error.matches}`
            case "BoardTaskTypeNotFoundError":
              return `board-task-type:${error.board}:${error.identifier}`
            case "BoardTaskTypeIdentifierAmbiguousError":
              return `board-task-type-ambiguous:${error.board}:${error.identifier}:${error.matches}`
            case "BoardStatusNotFoundError":
              return `board-status:${error.board}:${error.identifier}`
            case "BoardStatusIdentifierAmbiguousError":
              return `board-status-ambiguous:${error.board}:${error.identifier}:${error.matches}`
            case "BoardArchivedCardDeleteError":
              return `board-card-delete-active:${error.board}:${error.identifier}`
            case "BoardModelSequenceMissingError":
              return `board-sequence:${error.cardClass}`
            case "BoardMutationUnsupportedError":
              return `board-mutation-unsupported:${error.message}`
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
            case "DriveNotFoundError":
              return `drive:${error.drive}`
            case "DriveIdentifierAmbiguousError":
              return `drive-ambiguous:${error.drive}:${error.matches.length}`
            case "DrivePathNotFoundError":
              return `drive-path:${error.drive}:${error.path}`
            case "DrivePathAmbiguousError":
              return `drive-path-ambiguous:${error.drive}:${error.path}:${error.candidates.length}`
            case "DriveParentNotFolderError":
              return `drive-parent-not-folder:${error.drive}:${error.path}:${error.parentPath}`
            case "DriveFileNotFoundError":
              return `drive-file:${error.drive}:${error.file}`
            case "DriveFileCommentNotFoundError":
              return `drive-file-comment:${error.drive}:${error.file}:${error.commentId}`
            case "DriveFileVersionNotFoundError":
              return `drive-version:${error.drive}:${error.file}:${error.version}`
            case "DrivePathConflictError":
              return `drive-path-conflict:${error.drive}:${error.path}:${error.existingKind}`
            case "DriveInvalidMoveError":
              return `drive-invalid-move:${error.drive}:${error.path}:${error.targetFolderPath}:${error.reason}`
            case "DriveInvalidItemOperationError":
              return `drive-invalid-item-operation:${error.drive}:${error.path}:${error.operation}:${error.reason}`
            case "DriveFolderNotEmptyError":
              return `drive-folder-not-empty:${error.drive}:${error.path}:${error.childCount}:${error.children.length}`
            case "DriveNotEmptyError":
              return `drive-not-empty:${error.drive}:${error.childCount}:${error.children.length}`
            case "MessageTemplateCategoryNotFoundError":
              return `message-template-category:${error.identifier}`
            case "MessageTemplateCategoryIdentifierAmbiguousError":
              return `message-template-category-ambiguous:${error.identifier}:${error.matches}`
            case "MessageTemplateNotFoundError":
              return `message-template:${error.identifier}:${error.category ?? ""}`
            case "MessageTemplateIdentifierAmbiguousError":
              return `message-template-ambiguous:${error.identifier}:${error.matches}`
            case "TemplateFieldCategoryNotFoundError":
              return `template-field-category:${error.identifier}`
            case "TemplateFieldCategoryIdentifierAmbiguousError":
              return `template-field-category-ambiguous:${error.identifier}:${error.matches}`
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
        expect(matchError(
          new MessageTemplateCategoryNotFoundError({
            identifier: MessageTemplateCategoryIdentifier.make("Sales")
          })
        )).toBe(
          "message-template-category:Sales"
        )
        expect(
          new MessageTemplateCategoryNotFoundError({
            identifier: MessageTemplateCategoryIdentifier.make("Sales")
          }).message
        ).toBe(
          "Message template category 'Sales' not found"
        )
        expect(matchError(
          new MessageTemplateCategoryIdentifierAmbiguousError({
            identifier: MessageTemplateCategoryIdentifier.make("Sales"),
            matches: Count.make(2)
          })
        ))
          .toBe("message-template-category-ambiguous:Sales:2")
        expect(
          new MessageTemplateCategoryIdentifierAmbiguousError({
            identifier: MessageTemplateCategoryIdentifier.make("Sales"),
            matches: Count.make(2)
          }).message
        ).toBe("Message template category 'Sales' matched 2 categories; use the category ID")
        expect(matchError(
          new MessageTemplateNotFoundError({
            identifier: MessageTemplateIdentifier.make("Intro"),
            category: MessageTemplateCategoryIdentifier.make("Sales")
          })
        )).toBe(
          "message-template:Intro:Sales"
        )
        expect(new MessageTemplateNotFoundError({ identifier: MessageTemplateIdentifier.make("Intro") }).message).toBe(
          "Message template 'Intro' not found"
        )
        expect(
          new MessageTemplateNotFoundError({
            identifier: MessageTemplateIdentifier.make("Intro"),
            category: MessageTemplateCategoryIdentifier.make("Sales")
          }).message
        ).toBe("Message template 'Intro' not found in category 'Sales'")
        expect(matchError(
          new MessageTemplateIdentifierAmbiguousError({
            identifier: MessageTemplateIdentifier.make("Intro"),
            matches: Count.make(2)
          })
        )).toBe(
          "message-template-ambiguous:Intro:2"
        )
        expect(
          new MessageTemplateIdentifierAmbiguousError({
            identifier: MessageTemplateIdentifier.make("Intro"),
            matches: Count.make(2)
          }).message
        ).toBe(
          "Message template 'Intro' matched 2 templates; provide category to disambiguate"
        )
        expect(matchError(
          new TemplateFieldCategoryNotFoundError({
            identifier: TemplateFieldCategoryIdentifier.make("Contact")
          })
        )).toBe(
          "template-field-category:Contact"
        )
        expect(
          new TemplateFieldCategoryNotFoundError({
            identifier: TemplateFieldCategoryIdentifier.make("Contact")
          }).message
        ).toBe(
          "Template field category 'Contact' not found"
        )
        expect(matchError(
          new TemplateFieldCategoryIdentifierAmbiguousError({
            identifier: TemplateFieldCategoryIdentifier.make("Contact"),
            matches: Count.make(2)
          })
        ))
          .toBe("template-field-category-ambiguous:Contact:2")
        expect(
          new TemplateFieldCategoryIdentifierAmbiguousError({
            identifier: TemplateFieldCategoryIdentifier.make("Contact"),
            matches: Count.make(2)
          }).message
        ).toBe("Template field category 'Contact' matched 2 categories; use the category ID")
        expect(matchError(new RecruitingVacancyNotFoundError({ identifier: VacancyIdentifier.make("VCN-1") }))).toBe(
          "recruiting-vacancy:VCN-1"
        )
        expect(matchError(
          new RecruitingVacancyIdentifierAmbiguousError({
            identifier: VacancyIdentifier.make("Engineer"),
            matches: Count.make(2)
          })
        )).toBe("recruiting-vacancy-ambiguous:Engineer:2")
        expect(matchError(
          new RecruitingVacancyTypeNotFoundError({ identifier: NonEmptyString.make("Default vacancy") })
        )).toBe("recruiting-vacancy-type:Default vacancy")
        expect(matchError(
          new RecruitingCandidateNotFoundError({ identifier: CandidateIdentifier.make("alice@example.com") })
        )).toBe("recruiting-candidate:alice@example.com")
        expect(matchError(
          new RecruitingApplicantNotFoundError({ identifier: ApplicantIdentifier.make("APP-1") })
        )).toBe("recruiting-applicant:APP-1")
        expect(matchError(
          new RecruitingApplicantIdentifierAmbiguousError({
            identifier: ApplicantIdentifier.make("APP-1"),
            matches: Count.make(2)
          })
        )).toBe("recruiting-applicant-ambiguous:APP-1:2")
        expect(matchError(
          new RecruitingDuplicateApplicantError({
            vacancy: VacancyIdentifier.make("VCN-1"),
            candidate: CandidateIdentifier.make("alice@example.com")
          })
        )).toBe("recruiting-applicant-duplicate:VCN-1:alice@example.com")
        expect(matchError(new RecruitingReviewNotFoundError({ identifier: ReviewIdentifier.make("RVE-1") }))).toBe(
          "recruiting-review:RVE-1"
        )
        expect(matchError(
          new RecruitingReviewIdentifierAmbiguousError({
            identifier: ReviewIdentifier.make("Interview"),
            matches: Count.make(2)
          })
        )).toBe("recruiting-review-ambiguous:Interview:2")
        expect(matchError(new RecruitingOpinionNotFoundError({ identifier: OpinionIdentifier.make("OPE-1") }))).toBe(
          "recruiting-opinion:OPE-1"
        )
        expect(matchError(
          new RecruitingOpinionIdentifierAmbiguousError({
            identifier: OpinionIdentifier.make("OPE-1"),
            matches: Count.make(2)
          })
        )).toBe("recruiting-opinion-ambiguous:OPE-1:2")
        expect(matchError(
          new RecruitingApplicantMatchNotFoundError({ identifier: ApplicantMatchIdentifier.make("match-1") })
        )).toBe("recruiting-applicant-match:match-1")
        expect(matchError(new RecruitingModelMissingError({ message: "missing sequence" }))).toBe(
          "recruiting-model-missing:missing sequence"
        )
        expect(matchError(new RecruitingMutationUnsupportedError({ message: "removeCollection missing" }))).toBe(
          "recruiting-mutation-unsupported:removeCollection missing"
        )
        expect(matchError(
          new RecruitingCommentNotFoundError({
            target: NonEmptyString.make("Recruiting vacancy 'Backend Engineer'"),
            commentId: CommentId.make("comment-1")
          })
        )).toBe("recruiting-comment:Recruiting vacancy 'Backend Engineer':comment-1")
        expect(matchError(
          new RecruitingAttachmentNotFoundError({
            target: NonEmptyString.make("Recruiting vacancy 'Backend Engineer'"),
            attachmentId: AttachmentId.make("attachment-1")
          })
        )).toBe("recruiting-attachment:Recruiting vacancy 'Backend Engineer':attachment-1")
        expect(matchError(
          new ChatMessageAttachmentNotFoundError({
            target: NonEmptyString.make("channel message 'msg-1' in channel 'general'"),
            attachmentId: AttachmentId.make("attachment-1")
          })
        )).toBe("chat-attachment:channel message 'msg-1' in channel 'general':attachment-1")
        expect(matchError(new BoardNotFoundError({ identifier: "Roadmap" }))).toBe("board:Roadmap")
        expect(matchError(new BoardIdentifierAmbiguousError({ identifier: "Roadmap", matches: 2 }))).toBe(
          "board-ambiguous:Roadmap:2"
        )
        expect(matchError(new BoardCardNotFoundError({ board: "Roadmap", identifier: "CARD-1" }))).toBe(
          "board-card:Roadmap:CARD-1"
        )
        expect(matchError(
          new BoardCardIdentifierAmbiguousError({
            board: "Roadmap",
            identifier: "Planning",
            matches: 2
          })
        )).toBe("board-card-ambiguous:Roadmap:Planning:2")
        expect(matchError(new BoardProjectTypeNotFoundError({ identifier: "Kanban" }))).toBe(
          "board-project-type:Kanban"
        )
        expect(matchError(new BoardProjectTypeIdentifierAmbiguousError({ identifier: "Kanban", matches: 2 }))).toBe(
          "board-project-type-ambiguous:Kanban:2"
        )
        expect(matchError(new BoardTaskTypeNotFoundError({ board: "Roadmap", identifier: "Card" }))).toBe(
          "board-task-type:Roadmap:Card"
        )
        expect(matchError(
          new BoardTaskTypeIdentifierAmbiguousError({
            board: "Roadmap",
            identifier: "Card",
            matches: 2
          })
        )).toBe("board-task-type-ambiguous:Roadmap:Card:2")
        expect(matchError(new BoardStatusNotFoundError({ board: "Roadmap", identifier: "Todo" }))).toBe(
          "board-status:Roadmap:Todo"
        )
        expect(matchError(
          new BoardStatusIdentifierAmbiguousError({
            board: "Roadmap",
            identifier: "Todo",
            matches: 2
          })
        )).toBe("board-status-ambiguous:Roadmap:Todo:2")
        expect(matchError(new BoardArchivedCardDeleteError({ board: "Roadmap", identifier: "CARD-1" }))).toBe(
          "board-card-delete-active:Roadmap:CARD-1"
        )
        expect(matchError(new BoardModelSequenceMissingError({ cardClass: "board:class:Card" }))).toBe(
          "board-sequence:board:class:Card"
        )
        expect(matchError(new BoardMutationUnsupportedError({ message: "removeCollection missing" }))).toBe(
          "board-mutation-unsupported:removeCollection missing"
        )
        expect(matchError(
          new RecruitingIssueLocatorInvalidError({
            issue: IssueIdentifier.make("1"),
            reason: "project is required"
          })
        )).toBe("recruiting-issue-invalid:1:project is required")
        expect(new TodoIdentifierAmbiguousError({ locator: "title:Fix bug", matches: 2 }).message).toBe(
          "Planner ToDo locator is ambiguous: title:Fix bug matched 2 ToDos"
        )
        expect(matchError(new TodoWorkSlotNotFoundError({ workSlotId: "slot-1" }))).toBe("todo-workslot:slot-1")
        expect(matchError(new InventoryCategoryNotFoundError({ identifier: "Cat" }))).toBe("inventory-category:Cat")
        expect(new InventoryCategoryNotFoundError({ identifier: "Cat" }).message).toBe(
          "Inventory category 'Cat' not found"
        )
        expect(matchError(new InventoryProductNotFoundError({ identifier: "Product" }))).toBe(
          "inventory-product:Product"
        )
        expect(new InventoryProductNotFoundError({ identifier: "Product" }).message).toBe(
          "Inventory product 'Product' not found"
        )
        expect(matchError(new InventoryVariantNotFoundError({ identifier: "SKU-1" }))).toBe("inventory-variant:SKU-1")
        expect(new InventoryVariantNotFoundError({ identifier: "SKU-1" }).message).toBe(
          "Inventory variant/SKU 'SKU-1' not found"
        )
        expect(matchError(new InventoryCategoryIdentifierAmbiguousError({ identifier: "Cat", matches: 2 }))).toBe(
          "inventory-category-ambiguous:Cat:2"
        )
        expect(new InventoryCategoryIdentifierAmbiguousError({ identifier: "Cat", matches: 2 }).message).toBe(
          "Inventory category 'Cat' matched 2 categories; pass parentCategory or use the category ID"
        )
        expect(matchError(new InventoryProductIdentifierAmbiguousError({ identifier: "Product", matches: 2 }))).toBe(
          "inventory-product-ambiguous:Product:2"
        )
        expect(new InventoryProductIdentifierAmbiguousError({ identifier: "Product", matches: 2 }).message).toBe(
          "Inventory product 'Product' matched 2 products; pass category or use the product ID"
        )
        expect(matchError(new InventoryProductCommentNotFoundError({ product: "Product", commentId: "comment-1" })))
          .toBe(
            "inventory-product-comment:Product:comment-1"
          )
        expect(new InventoryProductCommentNotFoundError({ product: "Product", commentId: "comment-1" }).message).toBe(
          "Comment 'comment-1' not found on inventory product 'Product'"
        )
        expect(matchError(new InventoryVariantIdentifierAmbiguousError({ identifier: "SKU-1", matches: 2 }))).toBe(
          "inventory-variant-ambiguous:SKU-1:2"
        )
        expect(new InventoryVariantIdentifierAmbiguousError({ identifier: "SKU-1", matches: 2 }).message).toBe(
          "Inventory variant/SKU 'SKU-1' matched 2 variants; pass product or use the variant ID"
        )
        expect(matchError(new InventoryConflictError({ message: "duplicate" }))).toBe("inventory-conflict:duplicate")
        expect(matchError(new InventoryNotEmptyError({ message: "not empty" }))).toBe("inventory-not-empty:not empty")
        expect(matchError(new InventoryMutationUnsupportedError({ message: "unsupported" }))).toBe(
          "inventory-mutation-unsupported:unsupported"
        )
        expect(new TodoWorkSlotNotFoundError({ workSlotId: "slot-1" }).message).toBe(
          "Planner ToDo work slot 'slot-1' not found"
        )
        expect(matchError(new OrganizationNotFoundError({ identifier: "Acme" }))).toBe("organization:Acme")
        expect(
          matchError(new OrganizationIdentifierAmbiguousError({ identifier: "Acme", matches: Count.make(2) }))
        ).toBe("organization-ambiguous:Acme:2")
        expect(matchError(new InvalidContactProviderError({ provider: "fax" }))).toBe("contactprovider:fax")
        expect(
          matchError(
            new ContactChannelNotFoundError({
              ownerIdentifier: "person-1",
              channelIdentifier: "email:a@example.com"
            })
          )
        ).toBe("contact-channel:person-1:email:a@example.com")
        expect(
          matchError(
            new ContactChannelIdentifierAmbiguousError({
              ownerIdentifier: "person-1",
              channelIdentifier: "phone:+1555",
              matches: Count.make(2)
            })
          )
        ).toBe("contact-channel-ambiguous:person-1:phone:+1555:2")
        expect(
          matchError(
            new ContactChannelConflictError({
              ownerIdentifier: "person-1",
              provider: "email",
              value: "a@example.com"
            })
          )
        ).toBe("contact-channel-conflict:person-1:email:a@example.com")
        expect(
          matchError(new InvalidContactChannelValueError({ provider: "email", value: "not-email" }))
        ).toBe("contact-channel-value:email:not-email")
        expect(
          matchError(new InvalidContactChannelLocatorError({ ownerIdentifier: "person-1", reason: "bad locator" }))
        ).toBe("contact-channel-locator:person-1:bad locator")
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
        expect(matchError(new ChannelArchivedError({ channel: "general" }))).toBe("channel-archived:general")
        expect(matchError(new ChannelLastMemberRemovalError({ channel: "general" }))).toBe(
          "channel-last-member:general"
        )
        expect(matchError(new ChannelLastOwnerRemovalError({ channel: "general" }))).toBe(
          "channel-last-owner:general"
        )
        expect(matchError(new DirectMessageIdentifierAmbiguousError({ identifier: "dm-1", matches: Count.make(2) })))
          .toBe(
            "dm-ambiguous:dm-1:2"
          )
        expect(matchError(new DirectMessageNotFoundError({ identifier: "dm-1" }))).toBe("dm:dm-1")
        expect(
          matchError(
            new DirectMessageParticipantCountError({
              requested: Count.make(2),
              nonSelfParticipants: Count.make(1)
            })
          )
        ).toBe("dm-participant-count:2:1")
        expect(matchError(new MessageNotFoundError({ messageId: "msg-1", channel: "ch-1" }))).toBe("message:msg-1")
        expect(matchError(new ThreadReplyNotFoundError({ replyId: "r-1", messageId: "msg-1" }))).toBe("reply:r-1")
        expect(matchError(new CalendarNotAccessibleError({ calendarId: "cal-1" }))).toBe("calendar:cal-1")
        expect(matchError(new EventNotFoundError({ eventId: EventId.make("e-1") }))).toBe("event:e-1")
        expect(matchError(new RecurringEventNotFoundError({ eventId: EventId.make("re-1") }))).toBe("recurring:re-1")
        expect(matchError(new ActivityMessageNotFoundError({ messageId: "am-1" }))).toBe("activity:am-1")
        expect(matchError(new ReactionNotFoundError({ messageId: "msg-1", emoji: "heart" }))).toBe("reaction:heart")
        expect(matchError(new SavedMessageNotFoundError({ messageId: "sm-1" }))).toBe("saved:sm-1")
        expect(matchError(new AttachmentNotFoundError({ attachmentId: "att-1" }))).toBe("attachment:att-1")
        expect(matchError(new SavedAttachmentNotFoundError({ attachmentId: "att-1" }))).toBe(
          "saved-attachment:att-1"
        )
        expect(matchError(new DrawingNotFoundError({ drawingId: "drawing-1" }))).toBe("drawing:drawing-1")
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
        expect(matchError(new NotificationPersonSpaceNotFoundError({ user: "user-1" }))).toBe(
          "notif-person-space:user-1"
        )
        expect(
          matchError(new SpaceNotTypedError({ id: SpaceId.make("space-1"), name: NonEmptyString.make("General") }))
        ).toBe("space-not-typed:space-1:General")
        expect(
          matchError(
            new SpaceRoleNotFoundError({
              identifier: NonEmptyString.make("Admins"),
              spaceType: SpaceTypeId.make("space-type-1")
            })
          )
        ).toBe("space-role:Admins:space-type-1")
        expect(
          matchError(
            new SpaceRoleIdentifierAmbiguousError({
              identifier: NonEmptyString.make("Admins"),
              spaceType: SpaceTypeId.make("space-type-1"),
              matches: [
                { id: RoleId.make("role-a"), name: NonEmptyString.make("Admins") },
                { id: RoleId.make("role-b"), name: NonEmptyString.make("Admins") }
              ]
            })
          )
        ).toBe("space-role-ambiguous:Admins:space-type-1:2")
        expect(
          matchError(
            new SpaceRoleAssignmentsMalformedError({
              space: SpaceId.make("space-1"),
              spaceType: SpaceTypeId.make("space-type-1"),
              targetClass: ObjectClassName.make("core:class:Space"),
              reason: NonEmptyString.make("unknown role assignment key(s): role-missing")
            })
          )
        ).toBe("space-role-assignments-malformed:space-1:space-type-1:core:class:Space")
        expect(matchError(new NotificationTypeNotFoundError({ typeId: "nt-1" }))).toBe("notiftype:nt-1")
        expect(
          matchError(new NotificationProviderNotConfigurableError({ providerId: "np-1", typeId: "nt-1" }))
        ).toBe("notif-provider-not-configurable:np-1:nt-1")
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
        expect(matchError(new DriveNotFoundError({ drive: "Docs" }))).toBe("drive:Docs")
        expect(new DriveNotFoundError({ drive: "Docs" }).message).toBe("Drive 'Docs' not found")
        expect(matchError(
          new DriveIdentifierAmbiguousError({
            drive: "Docs",
            matches: [{ id: "drive-1", name: "Docs" }, { id: "drive-2", name: "Docs" }]
          })
        )).toBe("drive-ambiguous:Docs:2")
        expect(
          new DriveIdentifierAmbiguousError({
            drive: "Docs",
            matches: [{ id: "drive-1", name: "Docs" }, { id: "drive-2", name: "Docs" }]
          }).message
        ).toBe("Drive 'Docs' is ambiguous; use an exact drive id. Matches: Docs (drive-1), Docs (drive-2)")
        expect(matchError(new DrivePathNotFoundError({ drive: "Docs", path: "/missing" }))).toBe(
          "drive-path:Docs:/missing"
        )
        expect(new DrivePathNotFoundError({ drive: "Docs", path: "/missing" }).message).toBe(
          "Drive path '/missing' not found in drive 'Docs'"
        )
        expect(
          matchError(
            new DrivePathAmbiguousError({
              drive: "Docs",
              path: "/Specs",
              candidates: [
                { id: "folder-1", path: "/Specs", kind: "folder" },
                { id: "file-1", path: "/Specs", kind: "file" }
              ]
            })
          )
        ).toBe("drive-path-ambiguous:Docs:/Specs:2")
        expect(
          new DrivePathAmbiguousError({
            drive: "Docs",
            path: "/Specs",
            candidates: [
              { id: "folder-1", path: "/Specs", kind: "folder" },
              { id: "file-1", path: "/Specs", kind: "file" }
            ]
          }).message
        ).toBe(
          "Drive path '/Specs' in drive 'Docs' is ambiguous. Matches: /Specs (folder folder-1), /Specs (file file-1)"
        )
        expect(matchError(
          new DriveParentNotFolderError({
            drive: "Docs",
            path: "/readme/child",
            parentPath: "/readme"
          })
        )).toBe("drive-parent-not-folder:Docs:/readme/child:/readme")
        expect(
          new DriveParentNotFolderError({
            drive: "Docs",
            path: "/readme/child",
            parentPath: "/readme"
          }).message
        ).toBe("Drive parent '/readme' for path '/readme/child' is not a folder in drive 'Docs'")
        expect(matchError(new DriveFileNotFoundError({ drive: "Docs", file: "/missing.txt" }))).toBe(
          "drive-file:Docs:/missing.txt"
        )
        expect(new DriveFileNotFoundError({ drive: "Docs", file: "/missing.txt" }).message).toBe(
          "Drive file '/missing.txt' not found in drive 'Docs'"
        )
        expect(matchError(
          new DriveFileCommentNotFoundError({
            drive: "Docs",
            file: "file-1",
            commentId: "comment-1"
          })
        )).toBe("drive-file-comment:Docs:file-1:comment-1")
        expect(
          new DriveFileCommentNotFoundError({
            drive: "Docs",
            file: "file-1",
            commentId: "comment-1"
          }).message
        ).toBe("Drive file comment 'comment-1' for file 'file-1' not found in drive 'Docs'")
        expect(matchError(
          new DriveFileVersionNotFoundError({
            drive: "Docs",
            file: "file-1",
            version: "3"
          })
        )).toBe("drive-version:Docs:file-1:3")
        expect(
          new DriveFileVersionNotFoundError({
            drive: "Docs",
            file: "file-1",
            version: "3"
          }).message
        ).toBe("Drive file version '3' for file 'file-1' not found in drive 'Docs'")
        expect(new DrivePathConflictError({ drive: "Docs", path: "/x", existingKind: "file" }).message).toBe(
          "Drive path '/x' already exists as a file in drive 'Docs'"
        )
        expect(matchError(
          new DriveInvalidMoveError({
            drive: "Docs",
            path: "/Specs",
            targetFolderPath: "/Specs/API",
            reason: "a folder cannot be moved into itself or one of its descendants"
          })
        )).toBe(
          "drive-invalid-move:Docs:/Specs:/Specs/API:a folder cannot be moved into itself or one of its descendants"
        )
        expect(
          new DriveInvalidMoveError({
            drive: "Docs",
            path: "/Specs",
            targetFolderPath: "/Specs/API",
            reason: "a folder cannot be moved into itself or one of its descendants"
          }).message
        ).toBe(
          "Cannot move Drive item '/Specs' to '/Specs/API' in drive 'Docs': a folder cannot be moved into itself or one of its descendants"
        )
        expect(
          new DriveInvalidItemOperationError({
            drive: "Docs",
            path: "/",
            operation: "delete",
            reason: "the Drive root is not a file or folder item"
          }).message
        ).toBe("Cannot delete Drive item '/' in drive 'Docs': the Drive root is not a file or folder item")
        expect(matchError(
          new DriveFolderNotEmptyError({
            drive: "Docs",
            path: "/Specs",
            childCount: Count.make(1),
            children: [{ id: "file-1", title: "API.md", kind: "file" }]
          })
        )).toBe("drive-folder-not-empty:Docs:/Specs:1:1")
        expect(
          new DriveFolderNotEmptyError({
            drive: "Docs",
            path: "/Specs",
            childCount: Count.make(1),
            children: [{ id: "file-1", title: "API.md", kind: "file" }]
          }).message
        ).toBe("Drive folder '/Specs' in drive 'Docs' is not empty (1 child items). Children: API.md (file file-1)")
        expect(
          new DriveFolderNotEmptyError({
            drive: "Docs",
            path: "/Specs",
            childCount: Count.make(0),
            children: []
          }).message
        ).toBe("Drive folder '/Specs' in drive 'Docs' is not empty (0 child items).")
        expect(matchError(
          new DriveNotEmptyError({
            drive: "Docs",
            childCount: Count.make(1),
            children: [{ id: "folder-1", title: "Specs", kind: "folder" }]
          })
        )).toBe("drive-not-empty:Docs:1:1")
        expect(
          new DriveNotEmptyError({
            drive: "Docs",
            childCount: Count.make(1),
            children: [{ id: "folder-1", title: "Specs", kind: "folder" }]
          }).message
        ).toBe("Drive 'Docs' is not empty (1 child items). Children: Specs (folder folder-1)")
        expect(
          new DriveNotEmptyError({
            drive: "Docs",
            childCount: Count.make(0),
            children: []
          }).message
        ).toBe("Drive 'Docs' is not empty (0 child items).")
      }))
  })
})
