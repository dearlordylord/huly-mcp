/**
 * Virtual office and meeting domain errors.
 *
 * @module
 */
import { Schema } from "effect"

import { Count, FloorId, MeetingMinutesId, RoomId } from "../domain/schemas/shared.js"
import { FloorIdentifier } from "../domain/schemas/virtual-office-administration.js"
import { RoomAccessSchema } from "../domain/schemas/virtual-office.js"

export class FloorNotFoundError extends Schema.TaggedError<FloorNotFoundError>()("FloorNotFoundError", {
  floorId: FloorId
}) {
  override get message(): string {
    return `Office floor '${this.floorId}' not found`
  }
}

export class RoomNotFoundError extends Schema.TaggedError<RoomNotFoundError>()("RoomNotFoundError", {
  roomId: RoomId
}) {
  override get message(): string {
    return `Office room '${this.roomId}' not found`
  }
}

export class OfficeFloorNotFoundError extends Schema.TaggedError<OfficeFloorNotFoundError>()(
  "OfficeFloorNotFoundError",
  { identifier: FloorIdentifier }
) {
  override get message(): string {
    return `Office floor '${this.identifier}' not found`
  }
}

export class OfficeFloorIdentifierAmbiguousError extends Schema.TaggedError<OfficeFloorIdentifierAmbiguousError>()(
  "OfficeFloorIdentifierAmbiguousError",
  { identifier: FloorIdentifier, matches: Count }
) {
  override get message(): string {
    return `Office floor identifier '${this.identifier}' matched ${this.matches} floors; use floor ID`
  }
}

export class OfficeRoomProtectedError extends Schema.TaggedError<OfficeRoomProtectedError>()(
  "OfficeRoomProtectedError",
  { roomId: RoomId, field: Schema.Literal("name") }
) {
  override get message(): string {
    return `Office room '${this.roomId}' is a native protected room whose ${this.field} cannot be changed`
  }
}

export class OfficeRoomAccessUnsupportedError extends Schema.TaggedError<OfficeRoomAccessUnsupportedError>()(
  "OfficeRoomAccessUnsupportedError",
  { roomId: RoomId, access: RoomAccessSchema }
) {
  override get message(): string {
    return `Office room '${this.roomId}' is a personal office and does not support '${this.access}' access`
  }
}

export class OfficeSettingsMalformedError extends Schema.TaggedError<OfficeSettingsMalformedError>()(
  "OfficeSettingsMalformedError",
  { reason: Schema.Literal("recording and transcription defaults must be boolean values") }
) {
  override get message(): string {
    return `Virtual-office settings are malformed: ${this.reason}`
  }
}

export class MeetingMinutesNotFoundError extends Schema.TaggedError<MeetingMinutesNotFoundError>()(
  "MeetingMinutesNotFoundError",
  { meetingMinutesId: MeetingMinutesId }
) {
  override get message(): string {
    return `Meeting minutes '${this.meetingMinutesId}' not found`
  }
}
