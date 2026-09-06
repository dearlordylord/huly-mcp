import { Schema } from "effect"

import { DocId, EventId, NonEmptyString, RoomId } from "./shared.js"

export const MeetingRoomIdentifier = NonEmptyString.pipe(Schema.brand("MeetingRoomIdentifier")).annotate({
  identifier: "MeetingRoomIdentifier",
  title: "MeetingRoomIdentifier",
  description: "Virtual-office room ID or exact room name. Resolution tries ID first, then exact name."
})
export type MeetingRoomIdentifier = Schema.Schema.Type<typeof MeetingRoomIdentifier>

export const MeetingRoomFloorIdentifier = NonEmptyString.pipe(Schema.brand("MeetingRoomFloorIdentifier")).annotate({
  identifier: "MeetingRoomFloorIdentifier",
  title: "MeetingRoomFloorIdentifier",
  description: "Exact virtual-office floor ID or exact floor name used to disambiguate a meeting-room name."
})
export type MeetingRoomFloorIdentifier = Schema.Schema.Type<typeof MeetingRoomFloorIdentifier>

export const MeetingRoomLocatorSchema = Schema.Struct({
  room: MeetingRoomIdentifier.annotateKey({
    description: "Room ID or exact room name. Exact names must resolve unambiguously within the optional floor."
  }),
  floor: Schema.optionalKey(
    MeetingRoomFloorIdentifier.annotateKey({
      description: "Optional floor ID or exact floor name used only to disambiguate a room-name match."
    })
  )
}).annotate({
  title: "MeetingRoomLocator",
  description:
    "Meeting-room locator. The room value is resolved as an ID first and otherwise as an exact name; floor scopes only name resolution."
})
export type MeetingRoomLocator = Schema.Schema.Type<typeof MeetingRoomLocatorSchema>

export const MeetingCompositionTargetSchema = Schema.Literals(["event", "schedule"])
export type MeetingCompositionTarget = Schema.Schema.Type<typeof MeetingCompositionTargetSchema>

export const MeetingCompositionOperationSchema = Schema.Literals([
  "create_event",
  "update_event",
  "create_schedule",
  "update_schedule"
])
export type MeetingCompositionOperation = Schema.Schema.Type<typeof MeetingCompositionOperationSchema>

export const MeetingCompositionFailedStepSchema = Schema.TaggedUnion({
  CreateEventDescription: { operation: Schema.Literal("create_event") },
  CreateEventBase: { operation: Schema.Literal("create_event") },
  CreateEventOwnerMeeting: { operation: Schema.Literal("create_event") },
  CreateEventSiblingMeetings: { operation: Schema.Literal("create_event") },
  CreateScheduleBase: { operation: Schema.Literal("create_schedule") },
  CreateScheduleMeeting: { operation: Schema.Literal("create_schedule") },
  UpdateEventRoom: { operation: Schema.Literal("update_event"), documentId: DocId },
  UpdateEventBase: { operation: Schema.Literal("update_event") },
  UpdateEventSiblings: { operation: Schema.Literal("update_event") },
  UpdateEventMarkup: { operation: Schema.Literal("update_event") },
  UpdateScheduleRoom: { operation: Schema.Literal("update_schedule") },
  UpdateScheduleBase: { operation: Schema.Literal("update_schedule") }
})
export type MeetingCompositionFailedStep = typeof MeetingCompositionFailedStepSchema.Type

export const MeetingCompositionResidualSchema = Schema.TaggedUnion({
  RoomAssignment: { target: MeetingCompositionTargetSchema, documentId: DocId, expectedRoomId: RoomId },
  RecordPresence: {
    target: MeetingCompositionTargetSchema,
    documentId: DocId,
    expected: Schema.Literals(["present", "absent"])
  },
  BaseFields: { target: MeetingCompositionTargetSchema, documentId: DocId },
  SiblingSet: { target: Schema.Literal("event"), eventId: EventId },
  Markup: {
    target: Schema.Literal("event"),
    documentId: DocId,
    risk: Schema.Literals(["content-not-restored", "uploaded-markup-may-be-orphaned"])
  }
})
export type MeetingCompositionResidual = typeof MeetingCompositionResidualSchema.Type

export const MeetingCompositionRecoverySchema = Schema.TaggedUnion({
  Recovered: {},
  Unconfirmed: { residuals: Schema.NonEmptyArray(MeetingCompositionResidualSchema) }
})
export type MeetingCompositionRecovery = typeof MeetingCompositionRecoverySchema.Type
