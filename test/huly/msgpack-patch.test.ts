/**
 * Tests for msgpack-patch module.
 *
 * Verifies the monkey-patch correctly handles heartbeat messages
 * while preserving normal msgpack functionality.
 */
import { describe, expect, it } from "vitest"

// Import the patch FIRST (simulating what index.ts does)
import { _testing, MSGPACK_PATCH_APPLIED } from "../../src/huly/msgpack-patch.js"

// Now import msgpackr - it should be patched
// eslint-disable-next-line @typescript-eslint/no-require-imports
const msgpackr = require("msgpackr")

describe("msgpack-patch", () => {
  describe("patch application", () => {
    it("exports MSGPACK_PATCH_APPLIED as true", () => {
      expect(MSGPACK_PATCH_APPLIED).toBe(true)
    })
  })

  describe("isHeartbeat helper", () => {
    it("detects ping! message", () => {
      const pingBuffer = Buffer.from("ping!")
      expect(_testing.isHeartbeat(pingBuffer)).toBe("ping!")
    })

    it("detects pong! message", () => {
      const pongBuffer = Buffer.from("pong!")
      expect(_testing.isHeartbeat(pongBuffer)).toBe("pong!")
    })

    it("returns null for non-heartbeat data", () => {
      const data = Buffer.from("hello")
      expect(_testing.isHeartbeat(data)).toBeNull()
    })

    it("returns null for partial heartbeat", () => {
      const partial = Buffer.from("ping")
      expect(_testing.isHeartbeat(partial)).toBeNull()
    })

    it("returns null for longer data", () => {
      const longer = Buffer.from("ping!!")
      expect(_testing.isHeartbeat(longer)).toBeNull()
    })
  })

  describe("patched msgpackr.unpack", () => {
    it("returns 'pong!' for raw pong message without throwing", () => {
      const pongBuffer = Buffer.from("pong!")
      // Without patch, this would throw: "Data read, but end of buffer not reached 112"
      const result = msgpackr.unpack(pongBuffer)
      expect(result).toBe("pong!")
    })

    it("returns 'ping!' for raw ping message without throwing", () => {
      const pingBuffer = Buffer.from("ping!")
      const result = msgpackr.unpack(pingBuffer)
      expect(result).toBe("ping!")
    })

    it("preserves normal msgpack decoding for valid data", () => {
      const data = { foo: "bar", num: 42 }
      const packed = msgpackr.pack(data)
      const result = msgpackr.unpack(packed)
      expect(result).toEqual(data)
    })

    it("preserves normal msgpack decoding for arrays", () => {
      const data = [1, 2, 3, "test"]
      const packed = msgpackr.pack(data)
      const result = msgpackr.unpack(packed)
      expect(result).toEqual(data)
    })

    it("preserves normal msgpack decoding for strings", () => {
      const data = "hello world"
      const packed = msgpackr.pack(data)
      const result = msgpackr.unpack(packed)
      expect(result).toBe(data)
    })
  })

  describe("patched msgpackr.decode", () => {
    it("returns 'pong!' for raw pong message", () => {
      const pongBuffer = Buffer.from("pong!")
      const result = msgpackr.decode(pongBuffer)
      expect(result).toBe("pong!")
    })

    it("returns 'ping!' for raw ping message", () => {
      const pingBuffer = Buffer.from("ping!")
      const result = msgpackr.decode(pingBuffer)
      expect(result).toBe("ping!")
    })

    it("preserves normal decoding", () => {
      const data = { key: "value" }
      const packed = msgpackr.encode(data)
      const result = msgpackr.decode(packed)
      expect(result).toEqual(data)
    })
  })

  describe("patched Unpackr instance", () => {
    it("handles pong! through Unpackr instance", () => {
      const unpackr = new msgpackr.Unpackr()
      const pongBuffer = Buffer.from("pong!")
      const result = unpackr.unpack(pongBuffer)
      expect(result).toBe("pong!")
    })

    it("handles ping! through Unpackr instance", () => {
      const unpackr = new msgpackr.Unpackr()
      const pingBuffer = Buffer.from("ping!")
      const result = unpackr.unpack(pingBuffer)
      expect(result).toBe("ping!")
    })

    it("preserves normal Unpackr decoding", () => {
      const packr = new msgpackr.Packr()
      const unpackr = new msgpackr.Unpackr()
      const data = { nested: { value: 123 } }
      const packed = packr.pack(data)
      const result = unpackr.unpack(packed)
      expect(result).toEqual(data)
    })

    it("handles pong! through Unpackr.decode", () => {
      const unpackr = new msgpackr.Unpackr()
      const pongBuffer = Buffer.from("pong!")
      const result = unpackr.decode(pongBuffer)
      expect(result).toBe("pong!")
    })
  })

  describe("patched Packr instance (inherits from Unpackr)", () => {
    it("handles pong! through Packr.unpack", () => {
      const packr = new msgpackr.Packr()
      const pongBuffer = Buffer.from("pong!")
      const result = packr.unpack(pongBuffer)
      expect(result).toBe("pong!")
    })

    it("handles ping! through Packr.unpack", () => {
      const packr = new msgpackr.Packr()
      const pingBuffer = Buffer.from("ping!")
      const result = packr.unpack(pingBuffer)
      expect(result).toBe("ping!")
    })

    it("preserves normal Packr encoding/decoding", () => {
      const packr = new msgpackr.Packr()
      const data = { test: [1, 2, 3] }
      const packed = packr.pack(data)
      const result = packr.unpack(packed)
      expect(result).toEqual(data)
    })
  })

  describe("error cases preserved", () => {
    it("still throws for truly invalid msgpack data", () => {
      // Random bytes that aren't valid msgpack and aren't heartbeat
      const invalidData = Buffer.from([0xff, 0xfe, 0xfd, 0xfc, 0xfb, 0xfa])
      expect(() => msgpackr.unpack(invalidData)).toThrow()
    })
  })
})
