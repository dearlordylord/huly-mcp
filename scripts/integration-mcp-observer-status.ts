import { Schema } from "effect"
import { MovementObserverStatusSchema, type MovementObserverStatus } from "../src/mcp/movement-stage-observer.js"
export const MAX_OBSERVER_STATUS_LINE_BYTES = 1024
// Internal stream/output ports. The production schema owns the parsed enum.
export const makeMovementStatusReader = (
  publish: (status: MovementObserverStatus) => void,
  unavailable: () => void
) => {
  let buffered = ""
  let dropping = false
  let active = true
  const deliver = (line: string) => {
    const parsed = Schema.decodeUnknownOption(Schema.fromJsonString(MovementObserverStatusSchema))(line)
    if (parsed._tag === "None") return
    try {
      publish({ observerStatus: parsed.value.observerStatus })
    } catch {
      try {
        unavailable()
      } catch {
        /* A diagnostic sink cannot change the tool outcome. */
      }
    }
  }
  const accept = (chunk: unknown) => {
    if (!active) return
    const parsed = Schema.decodeUnknownOption(Schema.Uint8Array)(chunk)
    if (parsed._tag === "None") return
    const pieces = Buffer.from(parsed.value).toString("utf8").split("\n")
    for (const [index, piece] of pieces.entries()) {
      if (!dropping) {
        if (Buffer.byteLength(buffered) + Buffer.byteLength(piece) > MAX_OBSERVER_STATUS_LINE_BYTES) {
          buffered = ""
          dropping = true
        } else buffered += piece
      }
      if (index < pieces.length - 1) {
        if (!dropping) deliver(buffered)
        buffered = ""
        dropping = false
      }
    }
  }
  return {
    accept,
    close: () => {
      active = false
      buffered = ""
    }
  }
}
