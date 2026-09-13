import { describe } from "@effect/vitest"
import { Effect, Result } from "effect"
import * as fc from "fast-check"
import { expect, it } from "vitest"

import { decodeBase64, isBlockedUrl } from "../../src/huly/storage.js"
import { propertyTestParameters } from "../helpers/property.js"

const byteArrayArbitrary = fc.uint8Array({ minLength: 1, maxLength: 4096 })
const base64StringArbitrary = byteArrayArbitrary.map((bytes) => Buffer.from(bytes).toString("base64"))
const octetArbitrary = fc.integer({ min: 0, max: 255 })
const hextetArbitrary = fc.integer({ min: 0, max: 0xffff })

const decodeBase64Result = (value: string): Result.Result<Buffer, unknown> =>
  Effect.runSync(Effect.result(decodeBase64(value)))

const expectDecodedBytes = (encoded: string, expected: Uint8Array): void => {
  const result = decodeBase64Result(encoded)

  if (Result.isFailure(result)) {
    throw new Error(`Expected base64 decode to succeed, got: ${String(result.failure)}`)
  }

  expect(result.success).toEqual(Buffer.from(expected))
}

const expectDecodeFailure = (encoded: string): void => {
  const result = decodeBase64Result(encoded)

  if (Result.isSuccess(result)) {
    throw new Error(`Expected base64 decode to fail, got ${result.success.length} decoded bytes`)
  }
}

const insertWhitespace = (value: string): string =>
  value
    .split("")
    .map((char, index) => (index % 4 === 0 ? ` \n${char}` : char))
    .join("") + "\r\n"

const malformedBase64Arbitrary = fc.oneof(
  base64StringArbitrary.map((value) => `${value.slice(0, 1)}!${value.slice(1)}`),
  base64StringArbitrary.map((value) => `${value.slice(0, 1)}=${value.slice(1)}`),
  base64StringArbitrary.map((value) => `${value}=`),
  base64StringArbitrary.map((value) => `${value},${value}`)
)

const malformedDataUrlArbitrary = base64StringArbitrary.chain((value) =>
  fc.constantFrom(`prefix,${value}`, `data:image/png,${value}`, `data:image/png;base64,`)
)

const ipv4Url = (a: number, b: number, c: number, d: number): string => `http://${a}.${b}.${c}.${d}/file`
const hex = (value: number): string => value.toString(16)
const ipv6Url = (a: number, b: number, c: number, d: number): string =>
  `https://[${hex(a)}:${hex(b)}:${hex(c)}:${hex(d)}::1]/file`

const blockedPrivateIpv4UrlArbitrary = fc
  .oneof(
    fc.tuple(fc.constant(0), octetArbitrary, octetArbitrary, octetArbitrary),
    fc.tuple(fc.constant(10), octetArbitrary, octetArbitrary, octetArbitrary),
    fc.tuple(fc.constant(100), fc.integer({ min: 64, max: 127 }), octetArbitrary, octetArbitrary),
    fc.tuple(fc.constant(127), octetArbitrary, octetArbitrary, octetArbitrary),
    fc.tuple(fc.constant(172), fc.integer({ min: 16, max: 31 }), octetArbitrary, octetArbitrary),
    fc.tuple(fc.constant(192), fc.constant(0), fc.constantFrom(0, 2), octetArbitrary),
    fc.tuple(fc.constant(192), fc.constant(168), octetArbitrary, octetArbitrary),
    fc.tuple(fc.constant(169), fc.constant(254), octetArbitrary, octetArbitrary),
    fc.tuple(fc.constant(198), fc.constantFrom(18, 19), octetArbitrary, octetArbitrary),
    fc.tuple(fc.constant(198), fc.constant(51), fc.constant(100), octetArbitrary),
    fc.tuple(fc.constant(203), fc.constant(0), fc.constant(113), octetArbitrary),
    fc.tuple(fc.integer({ min: 224, max: 255 }), octetArbitrary, octetArbitrary, octetArbitrary)
  )
  .map(([a, b, c, d]) => ipv4Url(a, b, c, d))

const publicIpv4UrlArbitrary = fc
  .oneof(
    fc.tuple(fc.constantFrom(1, 8, 11, 128, 171, 173, 193), octetArbitrary, octetArbitrary, octetArbitrary),
    fc.tuple(
      fc.constant(172),
      fc.oneof(fc.integer({ min: 0, max: 15 }), fc.integer({ min: 32, max: 255 })),
      octetArbitrary,
      octetArbitrary
    ),
    fc.tuple(
      fc.constant(192),
      fc.integer({ min: 0, max: 255 }).filter((b) => b !== 0 && b !== 168),
      octetArbitrary,
      octetArbitrary
    ),
    fc.tuple(
      fc.constant(169),
      fc.integer({ min: 0, max: 255 }).filter((b) => b !== 254),
      octetArbitrary,
      octetArbitrary
    )
  )
  .map(([a, b, c, d]) => ipv4Url(a, b, c, d))

const publicHostnameUrlArbitrary = fc
  .tuple(
    fc
      .stringMatching(/^[a-z](?:[a-z0-9-]{0,19}[a-z0-9])?$/)
      .filter((label) => label !== "localhost" && !label.startsWith("xn--")),
    fc.constantFrom("example.com", "huly.example.test", "cdn.test")
  )
  .map(([label, domain]) => `https://${label}.${domain}/file.png`)

const blockedSpecialUseIpv6UrlArbitrary = fc.oneof(
  fc
    .tuple(hextetArbitrary, hextetArbitrary)
    .map(([fourth, fifth]) => `https://[2001:2:0:${hex(fourth)}:${hex(fifth)}::1]/file`),
  fc
    .tuple(fc.integer({ min: 0x0010, max: 0x001f }), hextetArbitrary, hextetArbitrary)
    .map(([second, third, fourth]) => `https://[2001:${hex(second)}:${hex(third)}:${hex(fourth)}::1]/file`),
  fc
    .tuple(fc.integer({ min: 0x0020, max: 0x002f }), hextetArbitrary, hextetArbitrary)
    .map(([second, third, fourth]) => `https://[2001:${hex(second)}:${hex(third)}:${hex(fourth)}::1]/file`),
  fc
    .tuple(hextetArbitrary, hextetArbitrary)
    .map(([third, fourth]) => `https://[2001:0:${hex(third)}:${hex(fourth)}::1]/file`),
  fc
    .tuple(hextetArbitrary, hextetArbitrary)
    .map(([third, fourth]) => `https://[2001:3:${hex(third)}:${hex(fourth)}::1]/file`),
  fc
    .tuple(hextetArbitrary, hextetArbitrary)
    .map(([fourth, fifth]) => `https://[2001:4:112:${hex(fourth)}:${hex(fifth)}::1]/file`),
  fc
    .tuple(hextetArbitrary, hextetArbitrary, hextetArbitrary)
    .map(([second, third, fourth]) => `https://[2002:${hex(second)}:${hex(third)}:${hex(fourth)}::1]/file`),
  fc
    .tuple(fc.integer({ min: 0x0000, max: 0x0fff }), hextetArbitrary, hextetArbitrary)
    .map(([second, third, fourth]) => `https://[3fff:${hex(second)}:${hex(third)}:${hex(fourth)}::1]/file`)
)

const blockedNonGlobalIpv6UrlArbitrary = fc.oneof(
  fc
    .oneof(fc.integer({ min: 0, max: 0x1fff }), fc.integer({ min: 0x4000, max: 0xffff }))
    .map((firstHextet) => `https://[${hex(firstHextet)}::1]/file`),
  fc
    .tuple(fc.integer({ min: 0xfe80, max: 0xfebf }), hextetArbitrary)
    .map(([first, second]) => `https://[${hex(first)}:${hex(second)}::1]/file`),
  fc
    .tuple(fc.integer({ min: 0xfec0, max: 0xfeff }), hextetArbitrary)
    .map(([first, second]) => `https://[${hex(first)}:${hex(second)}::1]/file`),
  fc
    .tuple(fc.integer({ min: 0xfc00, max: 0xfdff }), hextetArbitrary)
    .map(([first, second]) => `https://[${hex(first)}:${hex(second)}::1]/file`),
  fc
    .tuple(fc.integer({ min: 0xff00, max: 0xffff }), hextetArbitrary)
    .map(([first, second]) => `https://[${hex(first)}:${hex(second)}::1]/file`),
  fc
    .tuple(hextetArbitrary, hextetArbitrary)
    .map(([third, fourth]) => `https://[2001:db8:${hex(third)}:${hex(fourth)}::1]/file`),
  blockedSpecialUseIpv6UrlArbitrary
)

const publicIpv6UrlArbitrary = fc
  .tuple(
    fc.constantFrom(0x2400, 0x2606, 0x2800, 0x2a00, 0x2c00, 0x3000),
    hextetArbitrary,
    hextetArbitrary,
    hextetArbitrary
  )
  .map(([first, second, third, fourth]) => ipv6Url(first, second, third, fourth))

describe("decodeBase64 properties", () => {
  it("roundtrips arbitrary non-empty bytes encoded with Buffer base64", () => {
    fc.assert(
      fc.property(byteArrayArbitrary, (bytes) => {
        expectDecodedBytes(Buffer.from(bytes).toString("base64"), bytes)
      }),
      propertyTestParameters
    )
  })

  it("ignores inserted ASCII whitespace and newlines", () => {
    fc.assert(
      fc.property(byteArrayArbitrary, (bytes) => {
        const encoded = Buffer.from(bytes).toString("base64")

        expectDecodedBytes(insertWhitespace(encoded), bytes)
      }),
      propertyTestParameters
    )
  })

  it("allows omitted terminal padding", () => {
    fc.assert(
      fc.property(byteArrayArbitrary, (bytes) => {
        const encoded = Buffer.from(bytes).toString("base64").replace(/=+$/, "")

        expectDecodedBytes(encoded, bytes)
      }),
      propertyTestParameters
    )
  })

  it("decodes valid data URLs with explicit media type and preserves the payload bytes", () => {
    fc.assert(
      fc.property(
        byteArrayArbitrary,
        fc.constantFrom("image/png", "text/plain", "application/octet-stream"),
        (bytes, mediaType) => {
          const encoded = Buffer.from(bytes).toString("base64")

          expectDecodedBytes(`data:${mediaType};base64,${encoded}`, bytes)
        }
      ),
      propertyTestParameters
    )
  })

  it("decodes valid data URLs with omitted media type and preserves the payload bytes", () => {
    fc.assert(
      fc.property(byteArrayArbitrary, (bytes) => {
        const encoded = Buffer.from(bytes).toString("base64")

        expectDecodedBytes(`data:;base64,${encoded}`, bytes)
      }),
      propertyTestParameters
    )
  })

  it("rejects malformed base64 and malformed data URL prefixes", () => {
    fc.assert(
      fc.property(fc.oneof(malformedBase64Arbitrary, malformedDataUrlArbitrary), (value) => {
        expectDecodeFailure(value)
      }),
      propertyTestParameters
    )
  })
})

describe("isBlockedUrl properties", () => {
  it("blocks private, loopback, link-local, and reserved IPv4 ranges", () => {
    fc.assert(
      fc.property(blockedPrivateIpv4UrlArbitrary, (url) => {
        expect(isBlockedUrl(url)).toBe(true)
      }),
      propertyTestParameters
    )
  })

  it("blocks non-http protocols before fetch can reach them", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "data:text/plain;base64,SGVsbG8=",
          "file:///etc/passwd",
          "ftp://example.com/file",
          "ws://example.com/file",
          "mailto:test@example.com"
        ),
        (url) => {
          expect(isBlockedUrl(url)).toBe(true)
        }
      ),
      propertyTestParameters
    )
  })

  it("blocks localhost, IPv6 non-global addresses, cloud metadata hostnames, and unparsable strings", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "http://localhost/file",
          "http://localhost./file",
          "http://LOCALHOST:8080/file",
          "http://LOCALHOST.:8080/file",
          "http://[::]/file",
          "http://[::1]/file",
          "http://[fe80::1]/file",
          "http://[febf::1]/file",
          "http://[fec0::1]/file",
          "http://[feff::1]/file",
          "http://[fc00::1]/file",
          "http://[fdff::1]/file",
          "http://[ff00::1]/file",
          "http://[ffff::1]/file",
          "http://[100::1]/file",
          "http://[2001::1]/file",
          "http://[2001:1::1]/file",
          "http://[2001:1::2]/file",
          "http://[2001:2::1]/file",
          "http://[2001:10::1]/file",
          "http://[2001:20::1]/file",
          "http://[2001:db8::1]/file",
          "http://[2002::1]/file",
          "http://[3fff::1]/file",
          "http://[::ffff:10.0.0.1]/file",
          "http://[::ffff:127.0.0.1]/file",
          "http://[::ffff:192.168.1.1]/file",
          "http://metadata.google.internal/file",
          "http://metadata.google.internal./file",
          "not-a-url",
          ""
        ),
        (url) => {
          expect(isBlockedUrl(url)).toBe(true)
        }
      ),
      propertyTestParameters
    )
  })

  it("blocks generated IPv6 addresses outside the accepted global-unicast policy", () => {
    fc.assert(
      fc.property(blockedNonGlobalIpv6UrlArbitrary, (url) => {
        expect(isBlockedUrl(url)).toBe(true)
      }),
      propertyTestParameters
    )
  })

  it("blocks generated IPv6 special-use ranges inside 2000::/3", () => {
    fc.assert(
      fc.property(blockedSpecialUseIpv6UrlArbitrary, (url) => {
        expect(isBlockedUrl(url)).toBe(true)
      }),
      propertyTestParameters
    )
  })

  it("allows public IPv4 addresses, representative global IPv6 addresses, and ordinary hostnames", () => {
    fc.assert(
      fc.property(fc.oneof(publicIpv4UrlArbitrary, publicIpv6UrlArbitrary, publicHostnameUrlArbitrary), (url) => {
        expect(isBlockedUrl(url)).toBe(false)
      }),
      propertyTestParameters
    )
  })

  it("keeps 172.16/12 boundaries exact", () => {
    expect(isBlockedUrl("http://172.15.255.255/file")).toBe(false)
    expect(isBlockedUrl("http://172.16.0.0/file")).toBe(true)
    expect(isBlockedUrl("http://172.31.255.255/file")).toBe(true)
    expect(isBlockedUrl("http://172.32.0.0/file")).toBe(false)
  })
})
