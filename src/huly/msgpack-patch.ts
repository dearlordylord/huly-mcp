/**
 * Monkey-patch for msgpackr to handle raw text heartbeat messages.
 *
 * IMPORTANT: This file MUST be imported before any @hcengineering imports.
 *
 * Background:
 * - Huly server 0.7.310 sends raw text "pong!" and "ping!" for heartbeats
 * - The client uses msgpackr to deserialize all WebSocket messages
 * - Raw text causes: "Data read, but end of buffer not reached 112"
 *
 * Solution:
 * - Detect heartbeat messages before msgpack parsing
 * - Return them as-is (the raw string)
 *
 * @module
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const msgpackr = require("msgpackr")

const PING_BYTES = Buffer.from("ping!")
const PONG_BYTES = Buffer.from("pong!")

/**
 * Check if buffer matches heartbeat message.
 */
const isHeartbeat = (data: Buffer | Uint8Array): string | null => {
  if (data.length === 5) {
    if (Buffer.compare(Buffer.from(data), PING_BYTES) === 0) {
      return "ping!"
    }
    if (Buffer.compare(Buffer.from(data), PONG_BYTES) === 0) {
      return "pong!"
    }
  }
  return null
}

// Store original methods
const originalUnpack = msgpackr.unpack
const originalDecode = msgpackr.decode
const UnpackrPrototype = msgpackr.Unpackr.prototype
const originalUnpackrUnpack = UnpackrPrototype.unpack
const originalUnpackrDecode = UnpackrPrototype.decode

/**
 * Wrap unpack to detect heartbeat messages.
 */
msgpackr.unpack = function patchedUnpack(data: Buffer | Uint8Array, options?: unknown): unknown {
  const heartbeat = isHeartbeat(data)
  if (heartbeat !== null) {
    return heartbeat
  }
  return originalUnpack.call(this, data, options)
}

/**
 * Wrap decode (alias for unpack) to detect heartbeat messages.
 */
msgpackr.decode = function patchedDecode(data: Buffer | Uint8Array, options?: unknown): unknown {
  const heartbeat = isHeartbeat(data)
  if (heartbeat !== null) {
    return heartbeat
  }
  return originalDecode.call(this, data, options)
}

/**
 * Wrap Unpackr.prototype.unpack to detect heartbeat messages.
 */
UnpackrPrototype.unpack = function patchedUnpackrUnpack(
  this: unknown,
  data: Buffer | Uint8Array
): unknown {
  const heartbeat = isHeartbeat(data)
  if (heartbeat !== null) {
    return heartbeat
  }
  return originalUnpackrUnpack.call(this, data)
}

/**
 * Wrap Unpackr.prototype.decode to detect heartbeat messages.
 */
UnpackrPrototype.decode = function patchedUnpackrDecode(
  this: unknown,
  data: Buffer | Uint8Array
): unknown {
  const heartbeat = isHeartbeat(data)
  if (heartbeat !== null) {
    return heartbeat
  }
  return originalUnpackrDecode.call(this, data)
}

// Export for testing
export const _testing = {
  isHeartbeat,
  PING_BYTES,
  PONG_BYTES
}

// Flag to verify patch was applied
export const MSGPACK_PATCH_APPLIED = true
