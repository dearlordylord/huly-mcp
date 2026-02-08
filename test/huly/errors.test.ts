import { describe, it } from "@effect/vitest"
import { Effect, Match, Schema } from "effect"
import { expect } from "vitest"
import {
  ActivityMessageNotFoundError,
  AttachmentNotFoundError,
  BYTES_PER_MB,
  ChannelNotFoundError,
  CommentNotFoundError,
  ComponentNotFoundError,
  DocumentNotFoundError,
  EventNotFoundError,
  FileFetchError,
  FileNotFoundError,
  FileTooLargeError,
  FileUploadError,
  HulyAuthError,
  HulyConnectionError,
  type HulyDomainError,
  HulyDomainError as HulyDomainErrorSchema,
  HulyError,
  InvalidContentTypeError,
  InvalidFileDataError,
  InvalidPersonUuidError,
  InvalidStatusError,
  IssueNotFoundError,
  IssueTemplateNotFoundError,
  MessageNotFoundError,
  MilestoneNotFoundError,
  NotificationContextNotFoundError,
  NotificationNotFoundError,
  PersonNotFoundError,
  ProjectNotFoundError,
  ReactionNotFoundError,
  RecurringEventNotFoundError,
  SavedMessageNotFoundError,
  TeamspaceNotFoundError,
  ThreadReplyNotFoundError
} from "../../src/huly/errors.js"

describe("Huly Errors", () => {
  describe("HulyError", () => {
    // test-revizorro: approved
    it.effect("creates with message", () =>
      Effect.gen(function*() {
        const error = new HulyError({ message: "Something went wrong" })
        expect(error._tag).toBe("HulyError")
        expect(error.message).toBe("Something went wrong")
      }))

    // test-revizorro: approved
    it.effect("creates with cause", () =>
      Effect.gen(function*() {
        const cause = new Error("underlying error")
        const error = new HulyError({ message: "Wrapped error", cause })
        expect(error.cause).toBe(cause)
      }))
  })

  describe("HulyConnectionError", () => {
    // test-revizorro: approved
    it.effect("creates with message", () =>
      Effect.gen(function*() {
        const error = new HulyConnectionError({ message: "Connection failed" })
        expect(error._tag).toBe("HulyConnectionError")
        expect(error.message).toBe("Connection failed")
      }))

    // test-revizorro: approved
    it.effect("creates with cause", () =>
      Effect.gen(function*() {
        const cause = new Error("network timeout")
        const error = new HulyConnectionError({ message: "Connection failed", cause })
        expect(error.cause).toBe(cause)
      }))
  })

  describe("HulyAuthError", () => {
    // test-revizorro: approved
    it.effect("creates with message", () =>
      Effect.gen(function*() {
        const error = new HulyAuthError({ message: "Invalid credentials" })
        expect(error._tag).toBe("HulyAuthError")
        expect(error.message).toBe("Invalid credentials")
      }))
  })

  describe("IssueNotFoundError", () => {
    // test-revizorro: approved
    it.effect("creates with identifier and project", () =>
      Effect.gen(function*() {
        const error = new IssueNotFoundError({ identifier: "HULY-123", project: "HULY" })
        expect(error._tag).toBe("IssueNotFoundError")
        expect(error.identifier).toBe("HULY-123")
        expect(error.project).toBe("HULY")
      }))

    // test-revizorro: approved
    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new IssueNotFoundError({ identifier: "HULY-123", project: "HULY" })
        expect(error.message).toBe("Issue 'HULY-123' not found in project 'HULY'")
      }))
  })

  describe("ProjectNotFoundError", () => {
    // test-revizorro: approved
    it.effect("creates with identifier", () =>
      Effect.gen(function*() {
        const error = new ProjectNotFoundError({ identifier: "MISSING" })
        expect(error._tag).toBe("ProjectNotFoundError")
        expect(error.identifier).toBe("MISSING")
      }))

    // test-revizorro: approved
    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new ProjectNotFoundError({ identifier: "MISSING" })
        expect(error.message).toBe("Project 'MISSING' not found")
      }))
  })

  describe("InvalidStatusError", () => {
    // test-revizorro: approved
    it.effect("creates with status and project", () =>
      Effect.gen(function*() {
        const error = new InvalidStatusError({ status: "bogus", project: "HULY" })
        expect(error._tag).toBe("InvalidStatusError")
        expect(error.status).toBe("bogus")
        expect(error.project).toBe("HULY")
      }))

    // test-revizorro: approved
    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new InvalidStatusError({ status: "bogus", project: "HULY" })
        expect(error.message).toBe("Invalid status 'bogus' for project 'HULY'")
      }))
  })

  describe("FileUploadError", () => {
    // test-revizorro: approved
    it.effect("creates with message", () =>
      Effect.gen(function*() {
        const error = new FileUploadError({ message: "Storage quota exceeded" })
        expect(error._tag).toBe("FileUploadError")
        expect(error.message).toBe("Storage quota exceeded")
      }))

    // test-revizorro: approved
    it.effect("creates with cause", () =>
      Effect.gen(function*() {
        const cause = new Error("network error")
        const error = new FileUploadError({ message: "Upload failed", cause })
        expect(error.cause).toBe(cause)
      }))
  })

  describe("InvalidFileDataError", () => {
    // test-revizorro: approved
    it.effect("creates with message", () =>
      Effect.gen(function*() {
        const error = new InvalidFileDataError({ message: "Invalid base64 encoding" })
        expect(error._tag).toBe("InvalidFileDataError")
        expect(error.message).toBe("Invalid base64 encoding")
      }))
  })

  describe("FileNotFoundError", () => {
    // test-revizorro: approved
    it.effect("creates with filePath", () =>
      Effect.gen(function*() {
        const error = new FileNotFoundError({ filePath: "/tmp/missing.txt" })
        expect(error._tag).toBe("FileNotFoundError")
        expect(error.filePath).toBe("/tmp/missing.txt")
        expect(error.message).toBe("File not found: /tmp/missing.txt")
      }))
  })

  describe("FileFetchError", () => {
    // test-revizorro: approved
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
    // test-revizorro: approved
    it.effect("creates with identifier", () =>
      Effect.gen(function*() {
        const error = new TeamspaceNotFoundError({ identifier: "my-teamspace" })
        expect(error._tag).toBe("TeamspaceNotFoundError")
        expect(error.identifier).toBe("my-teamspace")
      }))

    // test-revizorro: approved
    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new TeamspaceNotFoundError({ identifier: "my-teamspace" })
        expect(error.message).toBe("Teamspace 'my-teamspace' not found")
      }))
  })

  describe("DocumentNotFoundError", () => {
    // test-revizorro: approved
    it.effect("creates with identifier and teamspace", () =>
      Effect.gen(function*() {
        const error = new DocumentNotFoundError({ identifier: "doc-1", teamspace: "engineering" })
        expect(error._tag).toBe("DocumentNotFoundError")
        expect(error.identifier).toBe("doc-1")
        expect(error.teamspace).toBe("engineering")
      }))

    // test-revizorro: approved
    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new DocumentNotFoundError({ identifier: "doc-1", teamspace: "engineering" })
        expect(error.message).toBe("Document 'doc-1' not found in teamspace 'engineering'")
      }))
  })

  describe("CommentNotFoundError", () => {
    // test-revizorro: approved
    it.effect("creates with commentId, issueIdentifier, and project", () =>
      Effect.gen(function*() {
        const error = new CommentNotFoundError({ commentId: "c-42", issueIdentifier: "HULY-99", project: "HULY" })
        expect(error._tag).toBe("CommentNotFoundError")
        expect(error.commentId).toBe("c-42")
        expect(error.issueIdentifier).toBe("HULY-99")
        expect(error.project).toBe("HULY")
      }))

    // test-revizorro: approved
    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new CommentNotFoundError({ commentId: "c-42", issueIdentifier: "HULY-99", project: "HULY" })
        expect(error.message).toBe("Comment 'c-42' not found on issue 'HULY-99' in project 'HULY'")
      }))
  })

  describe("MilestoneNotFoundError", () => {
    // test-revizorro: approved
    it.effect("creates with identifier and project", () =>
      Effect.gen(function*() {
        const error = new MilestoneNotFoundError({ identifier: "v1.0", project: "HULY" })
        expect(error._tag).toBe("MilestoneNotFoundError")
        expect(error.identifier).toBe("v1.0")
        expect(error.project).toBe("HULY")
      }))

    // test-revizorro: approved
    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new MilestoneNotFoundError({ identifier: "v1.0", project: "HULY" })
        expect(error.message).toBe("Milestone 'v1.0' not found in project 'HULY'")
      }))
  })

  describe("ChannelNotFoundError", () => {
    // test-revizorro: approved
    it.effect("creates with identifier", () =>
      Effect.gen(function*() {
        const error = new ChannelNotFoundError({ identifier: "general" })
        expect(error._tag).toBe("ChannelNotFoundError")
        expect(error.identifier).toBe("general")
      }))

    // test-revizorro: approved
    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new ChannelNotFoundError({ identifier: "general" })
        expect(error.message).toBe("Channel 'general' not found")
      }))
  })

  describe("MessageNotFoundError", () => {
    // test-revizorro: approved
    it.effect("creates with messageId and channel", () =>
      Effect.gen(function*() {
        const error = new MessageNotFoundError({ messageId: "msg-1", channel: "general" })
        expect(error._tag).toBe("MessageNotFoundError")
        expect(error.messageId).toBe("msg-1")
        expect(error.channel).toBe("general")
      }))

    // test-revizorro: approved
    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new MessageNotFoundError({ messageId: "msg-1", channel: "general" })
        expect(error.message).toBe("Message 'msg-1' not found in channel 'general'")
      }))
  })

  describe("ThreadReplyNotFoundError", () => {
    // test-revizorro: approved
    it.effect("creates with replyId and messageId", () =>
      Effect.gen(function*() {
        const error = new ThreadReplyNotFoundError({ replyId: "reply-5", messageId: "msg-1" })
        expect(error._tag).toBe("ThreadReplyNotFoundError")
        expect(error.replyId).toBe("reply-5")
        expect(error.messageId).toBe("msg-1")
      }))

    // test-revizorro: approved
    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new ThreadReplyNotFoundError({ replyId: "reply-5", messageId: "msg-1" })
        expect(error.message).toBe("Thread reply 'reply-5' not found on message 'msg-1'")
      }))
  })

  describe("EventNotFoundError", () => {
    // test-revizorro: approved
    it.effect("creates with eventId", () =>
      Effect.gen(function*() {
        const error = new EventNotFoundError({ eventId: "evt-100" })
        expect(error._tag).toBe("EventNotFoundError")
        expect(error.eventId).toBe("evt-100")
      }))

    // test-revizorro: approved
    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new EventNotFoundError({ eventId: "evt-100" })
        expect(error.message).toBe("Event 'evt-100' not found")
      }))
  })

  describe("RecurringEventNotFoundError", () => {
    // test-revizorro: approved
    it.effect("creates with eventId", () =>
      Effect.gen(function*() {
        const error = new RecurringEventNotFoundError({ eventId: "rec-200" })
        expect(error._tag).toBe("RecurringEventNotFoundError")
        expect(error.eventId).toBe("rec-200")
      }))

    // test-revizorro: approved
    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new RecurringEventNotFoundError({ eventId: "rec-200" })
        expect(error.message).toBe("Recurring event 'rec-200' not found")
      }))
  })

  describe("ActivityMessageNotFoundError", () => {
    // test-revizorro: approved
    it.effect("creates with messageId", () =>
      Effect.gen(function*() {
        const error = new ActivityMessageNotFoundError({ messageId: "act-10" })
        expect(error._tag).toBe("ActivityMessageNotFoundError")
        expect(error.messageId).toBe("act-10")
      }))

    // test-revizorro: approved
    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new ActivityMessageNotFoundError({ messageId: "act-10" })
        expect(error.message).toBe("Activity message 'act-10' not found")
      }))
  })

  describe("ReactionNotFoundError", () => {
    // test-revizorro: approved
    it.effect("creates with messageId and emoji", () =>
      Effect.gen(function*() {
        const error = new ReactionNotFoundError({ messageId: "msg-7", emoji: "thumbsup" })
        expect(error._tag).toBe("ReactionNotFoundError")
        expect(error.messageId).toBe("msg-7")
        expect(error.emoji).toBe("thumbsup")
      }))

    // test-revizorro: approved
    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new ReactionNotFoundError({ messageId: "msg-7", emoji: "thumbsup" })
        expect(error.message).toBe("Reaction 'thumbsup' not found on message 'msg-7'")
      }))
  })

  describe("SavedMessageNotFoundError", () => {
    // test-revizorro: approved
    it.effect("creates with messageId", () =>
      Effect.gen(function*() {
        const error = new SavedMessageNotFoundError({ messageId: "msg-saved-1" })
        expect(error._tag).toBe("SavedMessageNotFoundError")
        expect(error.messageId).toBe("msg-saved-1")
      }))

    // test-revizorro: approved
    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new SavedMessageNotFoundError({ messageId: "msg-saved-1" })
        expect(error.message).toBe("Saved message for 'msg-saved-1' not found")
      }))
  })

  describe("AttachmentNotFoundError", () => {
    // test-revizorro: approved
    it.effect("creates with attachmentId", () =>
      Effect.gen(function*() {
        const error = new AttachmentNotFoundError({ attachmentId: "att-3" })
        expect(error._tag).toBe("AttachmentNotFoundError")
        expect(error.attachmentId).toBe("att-3")
      }))

    // test-revizorro: approved
    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new AttachmentNotFoundError({ attachmentId: "att-3" })
        expect(error.message).toBe("Attachment 'att-3' not found")
      }))
  })

  describe("ComponentNotFoundError", () => {
    // test-revizorro: approved
    it.effect("creates with identifier and project", () =>
      Effect.gen(function*() {
        const error = new ComponentNotFoundError({ identifier: "frontend", project: "HULY" })
        expect(error._tag).toBe("ComponentNotFoundError")
        expect(error.identifier).toBe("frontend")
        expect(error.project).toBe("HULY")
      }))

    // test-revizorro: approved
    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new ComponentNotFoundError({ identifier: "frontend", project: "HULY" })
        expect(error.message).toBe("Component 'frontend' not found in project 'HULY'")
      }))
  })

  describe("IssueTemplateNotFoundError", () => {
    // test-revizorro: approved
    it.effect("creates with identifier and project", () =>
      Effect.gen(function*() {
        const error = new IssueTemplateNotFoundError({ identifier: "bug-report", project: "HULY" })
        expect(error._tag).toBe("IssueTemplateNotFoundError")
        expect(error.identifier).toBe("bug-report")
        expect(error.project).toBe("HULY")
      }))

    // test-revizorro: approved
    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new IssueTemplateNotFoundError({ identifier: "bug-report", project: "HULY" })
        expect(error.message).toBe("Issue template 'bug-report' not found in project 'HULY'")
      }))
  })

  describe("NotificationNotFoundError", () => {
    // test-revizorro: approved
    it.effect("creates with notificationId", () =>
      Effect.gen(function*() {
        const error = new NotificationNotFoundError({ notificationId: "notif-55" })
        expect(error._tag).toBe("NotificationNotFoundError")
        expect(error.notificationId).toBe("notif-55")
      }))

    // test-revizorro: approved
    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new NotificationNotFoundError({ notificationId: "notif-55" })
        expect(error.message).toBe("Notification 'notif-55' not found")
      }))
  })

  describe("NotificationContextNotFoundError", () => {
    // test-revizorro: approved
    it.effect("creates with contextId", () =>
      Effect.gen(function*() {
        const error = new NotificationContextNotFoundError({ contextId: "ctx-77" })
        expect(error._tag).toBe("NotificationContextNotFoundError")
        expect(error.contextId).toBe("ctx-77")
      }))

    // test-revizorro: approved
    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new NotificationContextNotFoundError({ contextId: "ctx-77" })
        expect(error.message).toBe("Notification context 'ctx-77' not found")
      }))
  })

  describe("InvalidPersonUuidError", () => {
    // test-revizorro: approved
    it.effect("creates with uuid", () =>
      Effect.gen(function*() {
        const error = new InvalidPersonUuidError({ uuid: "not-a-uuid" })
        expect(error._tag).toBe("InvalidPersonUuidError")
        expect(error.uuid).toBe("not-a-uuid")
      }))

    // test-revizorro: approved
    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new InvalidPersonUuidError({ uuid: "not-a-uuid" })
        expect(error.message).toBe("Invalid PersonUuid format: 'not-a-uuid'")
      }))
  })

  describe("FileTooLargeError", () => {
    // test-revizorro: approved
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

    // test-revizorro: approved
    it.effect("generates message with MB conversion", () =>
      Effect.gen(function*() {
        const error = new FileTooLargeError({
          filename: "big.zip",
          size: 15 * BYTES_PER_MB,
          maxSize: 10 * BYTES_PER_MB
        })
        expect(error.message).toBe("File 'big.zip' is too large (15.00MB). Maximum allowed: 10MB")
      }))

    // test-revizorro: approved
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
    // test-revizorro: approved
    it.effect("creates with filename and contentType", () =>
      Effect.gen(function*() {
        const error = new InvalidContentTypeError({ filename: "script.exe", contentType: "application/x-msdownload" })
        expect(error._tag).toBe("InvalidContentTypeError")
        expect(error.filename).toBe("script.exe")
        expect(error.contentType).toBe("application/x-msdownload")
      }))

    // test-revizorro: approved
    it.effect("generates message from fields", () =>
      Effect.gen(function*() {
        const error = new InvalidContentTypeError({ filename: "script.exe", contentType: "application/x-msdownload" })
        expect(error.message).toBe("Invalid content type 'application/x-msdownload' for file 'script.exe'")
      }))
  })

  describe("BYTES_PER_MB", () => {
    // test-revizorro: approved
    it.effect("equals 1024 * 1024", () =>
      Effect.gen(function*() {
        expect(BYTES_PER_MB).toBe(1048576)
      }))
  })

  describe("HulyDomainError Schema", () => {
    // test-revizorro: approved
    it.effect("decodes a valid error via Schema.Union", () =>
      Effect.gen(function*() {
        const error = new ProjectNotFoundError({ identifier: "X" })
        const decoded = yield* Schema.decode(HulyDomainErrorSchema)(error)
        expect(decoded._tag).toBe("ProjectNotFoundError")
      }))
  })

  describe("Effect integration", () => {
    // test-revizorro: approved
    it.effect("errors are yieldable", () =>
      Effect.gen(function*() {
        const program = Effect.gen(function*() {
          return yield* new IssueNotFoundError({ identifier: "HULY-1", project: "TEST" })
        })

        const error = yield* Effect.flip(program)
        expect(error._tag).toBe("IssueNotFoundError")
      }))

    // test-revizorro: approved
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

    // test-revizorro: approved
    it.effect("can pattern match with Match exhaustive over all error types", () =>
      Effect.gen(function*() {
        const matchError = Match.type<HulyDomainError>().pipe(
          Match.tag("IssueNotFoundError", (e) => `issue:${e.identifier}`),
          Match.tag("ProjectNotFoundError", (e) => `project:${e.identifier}`),
          Match.tag("InvalidStatusError", (e) => `status:${e.status}`),
          Match.tag("PersonNotFoundError", (e) => `person:${e.identifier}`),
          Match.tag("FileUploadError", (e) => `upload:${e.message}`),
          Match.tag("InvalidFileDataError", (e) => `data:${e.message}`),
          Match.tag("FileNotFoundError", (e) => `notfound:${e.filePath}`),
          Match.tag("FileFetchError", (e) => `fetch:${e.fileUrl}`),
          Match.tag("HulyConnectionError", () => "connection"),
          Match.tag("HulyAuthError", () => "auth"),
          Match.tag("HulyError", () => "generic"),
          Match.tag("TeamspaceNotFoundError", (e) => `teamspace:${e.identifier}`),
          Match.tag("DocumentNotFoundError", (e) => `document:${e.identifier}`),
          Match.tag("CommentNotFoundError", (e) => `comment:${e.commentId}`),
          Match.tag("MilestoneNotFoundError", (e) => `milestone:${e.identifier}`),
          Match.tag("ChannelNotFoundError", (e) => `channel:${e.identifier}`),
          Match.tag("MessageNotFoundError", (e) => `message:${e.messageId}`),
          Match.tag("ThreadReplyNotFoundError", (e) => `reply:${e.replyId}`),
          Match.tag("EventNotFoundError", (e) => `event:${e.eventId}`),
          Match.tag("RecurringEventNotFoundError", (e) => `recurring:${e.eventId}`),
          Match.tag("ActivityMessageNotFoundError", (e) => `activity:${e.messageId}`),
          Match.tag("ReactionNotFoundError", (e) => `reaction:${e.emoji}`),
          Match.tag("SavedMessageNotFoundError", (e) => `saved:${e.messageId}`),
          Match.tag("AttachmentNotFoundError", (e) => `attachment:${e.attachmentId}`),
          Match.tag("ComponentNotFoundError", (e) => `component:${e.identifier}`),
          Match.tag("IssueTemplateNotFoundError", (e) => `template:${e.identifier}`),
          Match.tag("NotificationNotFoundError", (e) => `notification:${e.notificationId}`),
          Match.tag("NotificationContextNotFoundError", (e) => `notifctx:${e.contextId}`),
          Match.tag("InvalidPersonUuidError", (e) => `uuid:${e.uuid}`),
          Match.tag("FileTooLargeError", (e) => `toolarge:${e.filename}`),
          Match.tag("InvalidContentTypeError", (e) => `contenttype:${e.contentType}`),
          Match.exhaustive
        )

        expect(matchError(new IssueNotFoundError({ identifier: "X", project: "Y" }))).toBe("issue:X")
        expect(matchError(new ProjectNotFoundError({ identifier: "Z" }))).toBe("project:Z")
        expect(matchError(new InvalidStatusError({ status: "bad", project: "P" }))).toBe("status:bad")
        expect(matchError(new PersonNotFoundError({ identifier: "john@example.com" }))).toBe("person:john@example.com")
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
          matchError(new CommentNotFoundError({ commentId: "c-1", issueIdentifier: "H-1", project: "P" }))
        ).toBe("comment:c-1")
        expect(matchError(new MilestoneNotFoundError({ identifier: "m-1", project: "P" }))).toBe("milestone:m-1")
        expect(matchError(new ChannelNotFoundError({ identifier: "ch-1" }))).toBe("channel:ch-1")
        expect(matchError(new MessageNotFoundError({ messageId: "msg-1", channel: "ch-1" }))).toBe("message:msg-1")
        expect(matchError(new ThreadReplyNotFoundError({ replyId: "r-1", messageId: "msg-1" }))).toBe("reply:r-1")
        expect(matchError(new EventNotFoundError({ eventId: "e-1" }))).toBe("event:e-1")
        expect(matchError(new RecurringEventNotFoundError({ eventId: "re-1" }))).toBe("recurring:re-1")
        expect(matchError(new ActivityMessageNotFoundError({ messageId: "am-1" }))).toBe("activity:am-1")
        expect(matchError(new ReactionNotFoundError({ messageId: "msg-1", emoji: "heart" }))).toBe("reaction:heart")
        expect(matchError(new SavedMessageNotFoundError({ messageId: "sm-1" }))).toBe("saved:sm-1")
        expect(matchError(new AttachmentNotFoundError({ attachmentId: "att-1" }))).toBe("attachment:att-1")
        expect(matchError(new ComponentNotFoundError({ identifier: "cmp-1", project: "P" }))).toBe("component:cmp-1")
        expect(matchError(new IssueTemplateNotFoundError({ identifier: "tpl-1", project: "P" }))).toBe("template:tpl-1")
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
      }))
  })
})
