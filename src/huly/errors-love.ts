/**
 * Virtual office and meeting domain errors.
 *
 * @module
 */
import { Schema } from "effect"

import { FloorId, MeetingMinutesId, RoomId } from "../domain/schemas/shared.js"

export class FloorNotFoundError extends Schema.TaggedError<FloorNotFoundError>()(
  "FloorNotFoundError",
  {
    floorId: FloorId
  }
) {
  override get message(): string {
    return `Office floor '${this.floorId}' not found`
  }
}

export class RoomNotFoundError extends Schema.TaggedError<RoomNotFoundError>()(
  "RoomNotFoundError",
  {
    roomId: RoomId
  }
) {
  override get message(): string {
    return `Office room '${this.roomId}' not found`
  }
}

export class MeetingMinutesNotFoundError extends Schema.TaggedError<MeetingMinutesNotFoundError>()(
  "MeetingMinutesNotFoundError",
  {
    meetingMinutesId: MeetingMinutesId
  }
) {
  override get message(): string {
    return `Meeting minutes '${this.meetingMinutesId}' not found`
  }
}
