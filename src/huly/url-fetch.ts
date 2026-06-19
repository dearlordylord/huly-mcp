/**
 * URL fetch helpers with SSRF protection.
 *
 * @module
 */
import type { LookupAddress } from "node:dns"
import { lookup as dnsLookup } from "node:dns/promises"
import * as http from "node:http"
import * as https from "node:https"
import type { LookupFunction } from "node:net"

import { Effect } from "effect"

import { assertAt } from "../utils/assertions.js"
import { FileFetchError, MAX_FILE_SIZE } from "./errors.js"

const FETCH_TIMEOUT_MS = 30_000
const HTTP_PROTOCOLS = new Set(["http:", "https:"])
const IPV4_OCTET_COUNT = 4
const IPV4_MAX_OCTET = 255
const IPV4_PRIVATE_10 = 10
const IPV4_CGNAT_A = 100
const IPV4_CGNAT_B_MIN = 64
const IPV4_CGNAT_B_MAX = 127
const IPV4_LOOPBACK_A = 127
const IPV4_LINK_LOCAL_A = 169
const IPV4_LINK_LOCAL_B = 254
const IPV4_PRIVATE_172_A = 172
const IPV4_PRIVATE_172_B_MIN = 16
const IPV4_PRIVATE_172_B_MAX = 31
const IPV4_RESERVED_192_A = 192
const IPV4_RESERVED_192_C_DOCS = 2
const IPV4_PRIVATE_192_B = 168
const IPV4_BENCHMARK_A = 198
const IPV4_BENCHMARK_B_MIN = 18
const IPV4_BENCHMARK_B_MAX = 19
const IPV4_DOCS_198_B = 51
const IPV4_DOCS_198_C = 100
const IPV4_DOCS_203_A = 203
const IPV4_DOCS_203_C = 113
const IPV4_MULTICAST_A_MIN = 224
const IPV6_HEXTET_MAX = 0xffff
const IPV6_HEXTET_COUNT = 8
const IPV6_HEXTET_BITS = 16
const IPV6_GLOBAL_UNICAST_MIN = 0x2000
const IPV6_GLOBAL_UNICAST_MAX = 0x3fff
const BYTE_BASE = 0x100
const HTTP_STATUS_OK_MIN = 200
const HTTP_STATUS_REDIRECT_MIN = 300

interface Ipv6Prefix {
  readonly hextets: ReadonlyArray<number>
  readonly prefixLength: number
}

const blockedIpv6SpecialUsePrefixes: ReadonlyArray<Ipv6Prefix> = [
  { hextets: [0xfe80], prefixLength: 10 },
  { hextets: [0xfc00], prefixLength: 7 },
  { hextets: [0xfec0], prefixLength: 10 },
  { hextets: [0xff00], prefixLength: 8 },
  { hextets: [0x2001, 0x0000], prefixLength: 32 },
  { hextets: [0x2001, 0x0001, 0, 0, 0, 0, 0, 1], prefixLength: 128 },
  { hextets: [0x2001, 0x0001, 0, 0, 0, 0, 0, 2], prefixLength: 128 },
  { hextets: [0x2001, 0x0002, 0], prefixLength: 48 },
  { hextets: [0x2001, 0x0003], prefixLength: 32 },
  { hextets: [0x2001, 0x0004, 0x0112], prefixLength: 48 },
  { hextets: [0x2001, 0x0010], prefixLength: 28 },
  { hextets: [0x2001, 0x0020], prefixLength: 28 },
  { hextets: [0x2001, 0x0db8], prefixLength: 32 },
  { hextets: [0x2002], prefixLength: 16 },
  { hextets: [0x3fff, 0x0000], prefixLength: 20 }
]

interface ResolvedAddress {
  readonly address: string
  readonly family: 4 | 6
}

interface FetchFromUrlDependencies {
  readonly resolveHostname: (hostname: string) => Promise<ReadonlyArray<ResolvedAddress>>
  readonly requestUrl: (url: URL, address: ResolvedAddress) => Promise<Buffer>
}

type Ipv6Hextets = readonly [number, number, number, number, number, number, number, number]

const parseIpv4Address = (hostname: string): readonly [number, number, number, number] | null => {
  const parts = hostname.split(".")
  if (parts.length !== IPV4_OCTET_COUNT) {
    return null
  }

  const octets = parts.map(Number)
  const a = assertAt(octets, 0)
  const b = assertAt(octets, 1)
  const c = assertAt(octets, 2)
  const d = assertAt(octets, 3)
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > IPV4_MAX_OCTET)) {
    return null
  }

  return [a, b, c, d]
}

const isBlockedIpv4Address = ([a, b, c]: readonly [number, number, number, number]): boolean => {
  if (a === 0) return true
  if (a === IPV4_PRIVATE_10) return true
  if (a === IPV4_CGNAT_A && b >= IPV4_CGNAT_B_MIN && b <= IPV4_CGNAT_B_MAX) return true
  if (a === IPV4_LOOPBACK_A) return true
  if (a === IPV4_LINK_LOCAL_A && b === IPV4_LINK_LOCAL_B) return true
  if (a === IPV4_PRIVATE_172_A && b >= IPV4_PRIVATE_172_B_MIN && b <= IPV4_PRIVATE_172_B_MAX) return true
  if (a === IPV4_RESERVED_192_A && b === 0 && c === 0) return true
  if (a === IPV4_RESERVED_192_A && b === 0 && c === IPV4_RESERVED_192_C_DOCS) return true
  if (a === IPV4_RESERVED_192_A && b === IPV4_PRIVATE_192_B) return true
  if (a === IPV4_BENCHMARK_A && (b === IPV4_BENCHMARK_B_MIN || b === IPV4_BENCHMARK_B_MAX)) return true
  if (a === IPV4_BENCHMARK_A && b === IPV4_DOCS_198_B && c === IPV4_DOCS_198_C) return true
  if (a === IPV4_DOCS_203_A && b === 0 && c === IPV4_DOCS_203_C) return true
  // 224.0.0.0/4 (multicast), 240.0.0.0/4 (reserved), and 255.255.255.255 (broadcast).
  return a >= IPV4_MULTICAST_A_MIN
}

const normalizeUrlHostname = (hostname: string): string =>
  hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1").replace(/\.+$/, "")

const mappedIpv4Prefix = "::ffff:"

const ipv4FromMappedIpv6 = (hostname: string): readonly [number, number, number, number] | null =>
  hostname.startsWith(mappedIpv4Prefix)
    ? parseIpv4Address(hostname.slice(mappedIpv4Prefix.length)) ?? ipv4FromMappedIpv6Hextets(hostname)
    : null

const ipv4FromMappedIpv6Hextets = (hostname: string): readonly [number, number, number, number] | null => {
  const match = hostname.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i)
  if (match === null) {
    return null
  }

  // Each capture is 1-4 hex digits, so high/low are bounded by IPV6_HEXTET_MAX by construction.
  const highText = assertAt(match, 1)
  const lowText = assertAt(match, 2)

  const high = Number.parseInt(highText, 16)
  const low = Number.parseInt(lowText, 16)
  return [
    Math.floor(high / BYTE_BASE),
    high % BYTE_BASE,
    Math.floor(low / BYTE_BASE),
    low % BYTE_BASE
  ]
}

const parseIpv6Hextet = (value: string): number | null => {
  if (!/^[0-9a-f]{1,4}$/i.test(value)) {
    return null
  }

  return Number.parseInt(value, 16)
}

const parseIpv6Side = (value: string): ReadonlyArray<number> | null => {
  if (value === "") {
    return []
  }

  const parts = value.split(":")
  const hextets = parts.flatMap((part) => {
    const hextet = parseIpv6Hextet(part)
    return hextet === null ? [] : [hextet]
  })

  return hextets.length === parts.length ? hextets : null
}

const isIpv6Hextets = (hextets: ReadonlyArray<number>): hextets is Ipv6Hextets => hextets.length === IPV6_HEXTET_COUNT

const toIpv6Hextets = (hextets: ReadonlyArray<number>): Ipv6Hextets => [
  assertAt(hextets, 0),
  assertAt(hextets, 1),
  assertAt(hextets, 2),
  assertAt(hextets, 3),
  assertAt(hextets, 4),
  assertAt(hextets, 5),
  assertAt(hextets, 6),
  assertAt(hextets, 7)
]

const parseIpv6Hextets = (hostname: string): Ipv6Hextets | null => {
  if (hostname.includes(".")) {
    return null
  }

  const compressedParts = hostname.split("::")
  if (compressedParts.length > 2) {
    return null
  }

  const leftText = assertAt(compressedParts, 0)

  const left = parseIpv6Side(leftText)
  const right = compressedParts.length === 2
    ? parseIpv6Side(assertAt(compressedParts, 1))
    : []
  if (left === null || right === null) {
    return null
  }

  if (compressedParts.length === 1) {
    return isIpv6Hextets(left) ? left : null
  }

  const zeroCount = IPV6_HEXTET_COUNT - left.length - right.length
  if (zeroCount < 1) {
    return null
  }

  const hextets = [...left, ...Array.from({ length: zeroCount }, () => 0), ...right]
  return toIpv6Hextets(hextets)
}

const isIpv6InPrefix = (hextets: Ipv6Hextets, prefix: Ipv6Prefix): boolean => {
  const fullHextetCount = Math.floor(prefix.prefixLength / IPV6_HEXTET_BITS)
  const remainingBits = prefix.prefixLength % IPV6_HEXTET_BITS

  let index = 0
  for (const prefixHextet of prefix.hextets.slice(0, fullHextetCount)) {
    const addressHextet = assertAt(hextets, index)
    if (addressHextet !== prefixHextet) {
      return false
    }

    index += 1
  }

  if (remainingBits === 0) {
    return true
  }

  const prefixHextet = assertAt(prefix.hextets, fullHextetCount)
  const addressHextet = assertAt(hextets, fullHextetCount)
  const mask = (IPV6_HEXTET_MAX << (IPV6_HEXTET_BITS - remainingBits)) & IPV6_HEXTET_MAX
  return (addressHextet & mask) === (prefixHextet & mask)
}

const requestFirstSuccessfulAddress = async (
  url: URL,
  dependencies: FetchFromUrlDependencies,
  addresses: ReadonlyArray<ResolvedAddress>,
  index = 0,
  failures: ReadonlyArray<string> = []
): Promise<Buffer> => {
  if (index >= addresses.length) {
    throw new Error(`Request failed for all resolved addresses: ${failures.join("; ")}`)
  }

  const address = assertAt(addresses, index)
  try {
    return await dependencies.requestUrl(url, address)
  } catch (error) {
    return requestFirstSuccessfulAddress(
      url,
      dependencies,
      addresses,
      index + 1,
      [...failures, `${address.address}: ${String(error)}`]
    )
  }
}

const isBlockedIpv6Address = (hostname: string): boolean => {
  const normalizedHostname = normalizeUrlHostname(hostname)
  const hextets = parseIpv6Hextets(normalizedHostname)

  if (hextets === null) {
    return true
  }

  if (hextets.every((hextet) => hextet === 0)) {
    return true
  }

  if (hextets.slice(0, 7).every((hextet) => hextet === 0) && hextets[7] === 1) {
    return true
  }

  if (blockedIpv6SpecialUsePrefixes.some((prefix) => isIpv6InPrefix(hextets, prefix))) {
    return true
  }

  // parseIpv6Hextets always yields 8 validated hextets, so the first is the global-unicast selector.
  const firstHextet = hextets[0]
  return firstHextet < IPV6_GLOBAL_UNICAST_MIN || firstHextet > IPV6_GLOBAL_UNICAST_MAX
}

/* v8 ignore start -- default DNS resolver: unit tests inject `resolveHostname` via FetchFromUrlDependencies; the real-DNS path (and its family-filtering helpers) is exercised by integration tests */
const isSupportedAddressFamily = (family: number): family is 4 | 6 => family === 4 || family === 6

const toResolvedAddress = (address: LookupAddress): ResolvedAddress | null =>
  isSupportedAddressFamily(address.family)
    ? {
      address: address.address,
      family: address.family
    }
    : null

const resolveHostname = async (hostname: string): Promise<ReadonlyArray<ResolvedAddress>> => {
  const addresses = await dnsLookup(hostname, { all: true, order: "verbatim" })
  return addresses.flatMap((address) => {
    const resolved = toResolvedAddress(address)
    return resolved === null ? [] : [resolved]
  })
}
/* v8 ignore stop */

const isBlockedResolvedAddress = (address: ResolvedAddress): boolean => {
  const normalizedAddress = normalizeUrlHostname(address.address)

  if (address.family === 4) {
    const ipv4Address = parseIpv4Address(normalizedAddress)
    return ipv4Address === null || isBlockedIpv4Address(ipv4Address)
  }

  const mappedIpv4Address = ipv4FromMappedIpv6(normalizedAddress)
  if (mappedIpv4Address !== null) {
    return isBlockedIpv4Address(mappedIpv4Address)
  }

  return isBlockedIpv6Address(normalizedAddress)
}

const makePinnedLookup = (address: ResolvedAddress): LookupFunction => (_hostname, options, callback) => {
  /* v8 ignore start -- Node always invokes the pinned lookup with { all: true }; the single-address callback form is unused */
  if (options.all !== true) {
    callback(null, address.address, address.family)
    return
  }
  /* v8 ignore stop */
  callback(null, [address])
}

const responseTooLargeError = (receivedBytes: number, maxBytes: number): Error =>
  new Error(`Response exceeded maximum file size (${receivedBytes} bytes > ${maxBytes} bytes)`)

export const requestUrl = (url: URL, address: ResolvedAddress, maxBytes = MAX_FILE_SIZE): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const effectiveMaxBytes = Math.min(maxBytes, MAX_FILE_SIZE)
    const controller = new AbortController()
    /* v8 ignore start -- abort fires only on the 30s fetch timeout (integration-tested) */
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    /* v8 ignore stop */
    let settled = false
    let receivedBytes = 0
    const rejectOnce = (error: Error): void => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timeout)
      reject(error)
    }
    const request = (url.protocol === "http:" ? http : https).request(
      url,
      {
        lookup: makePinnedLookup(address),
        signal: controller.signal,
        timeout: FETCH_TIMEOUT_MS
      },
      (response) => {
        /* v8 ignore start -- Node always sets statusCode on a parsed response */
        const statusCode = response.statusCode ?? 0
        /* v8 ignore stop */
        const chunks: Array<Buffer> = []

        response.on("error", (error) => {
          rejectOnce(error)
        })

        response.on("data", (chunk: Buffer | string) => {
          /* v8 ignore start -- Node delivers response bodies as Buffers; the string branch is defensive */
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
          /* v8 ignore stop */
          const nextReceivedBytes = receivedBytes + buffer.length

          if (nextReceivedBytes > effectiveMaxBytes) {
            const error = responseTooLargeError(nextReceivedBytes, effectiveMaxBytes)
            response.destroy(error)
            request.destroy(error)
            rejectOnce(error)
            return
          }

          receivedBytes = nextReceivedBytes
          chunks.push(buffer)
        })

        response.on("end", () => {
          /* v8 ignore start -- end firing after the response already settled (size-limit/abort) is a timing race */
          if (settled) {
            return
          }
          /* v8 ignore stop */

          settled = true
          clearTimeout(timeout)
          if (statusCode < HTTP_STATUS_OK_MIN || statusCode >= HTTP_STATUS_REDIRECT_MIN) {
            /* v8 ignore start -- Node populates statusMessage for parsed responses */
            reject(new Error(`HTTP ${statusCode}: ${response.statusMessage ?? "Unknown status"}`))
            /* v8 ignore stop */
            return
          }

          resolve(Buffer.concat(chunks))
        })
      }
    )

    /* v8 ignore start -- request timeout/abort fire only on the 30s fetch timeout (integration-tested) */
    request.on("timeout", () => {
      request.destroy(new Error("Request timed out"))
    })
    /* v8 ignore stop */
    request.on("error", (error) => {
      rejectOnce(error)
    })
    /* v8 ignore start -- abort listener fires only on the 30s fetch timeout (integration-tested) */
    controller.signal.addEventListener("abort", () => {
      request.destroy(new Error("Request timed out"))
    }, { once: true })
    /* v8 ignore stop */
    request.end()
  })

const defaultFetchFromUrlDependencies: FetchFromUrlDependencies = {
  requestUrl,
  resolveHostname
}

/**
 * Check if URL points to a potentially dangerous internal address.
 * Blocks: localhost, private IPs, non-global IPv6, link-local, and cloud metadata endpoints.
 */
export const isBlockedUrl = (urlString: string): boolean => {
  try {
    const url = new URL(urlString)
    const hostname = normalizeUrlHostname(url.hostname)

    if (!HTTP_PROTOCOLS.has(url.protocol)) {
      return true
    }

    if (hostname === "metadata.google.internal" || hostname === "localhost") {
      return true
    }

    const ipv4Address = parseIpv4Address(hostname)
    if (ipv4Address !== null) {
      return isBlockedIpv4Address(ipv4Address)
    }

    const mappedIpv4Address = ipv4FromMappedIpv6(hostname)
    if (mappedIpv4Address !== null) {
      return isBlockedIpv4Address(mappedIpv4Address)
    }

    return hostname.includes(":") ? isBlockedIpv6Address(hostname) : false
  } catch {
    return true
  }
}

/**
 * Fetch file from URL.
 * Includes timeout, SSRF protection, and redirect blocking.
 */
export const fetchFromUrl = (
  fileUrl: string,
  dependencies: FetchFromUrlDependencies = defaultFetchFromUrlDependencies
): Effect.Effect<Buffer, FileFetchError> =>
  Effect.tryPromise({
    try: async () => {
      const url = new URL(fileUrl)
      const hostname = normalizeUrlHostname(url.hostname)

      if (isBlockedUrl(fileUrl)) {
        throw new Error("URL blocked: internal/private/non-global addresses not allowed")
      }

      const addresses = await dependencies.resolveHostname(hostname)
      if (addresses.length === 0) {
        throw new Error("URL blocked: hostname did not resolve")
      }

      if (addresses.some(isBlockedResolvedAddress)) {
        throw new Error("URL blocked: DNS resolved to an internal/private/non-global address")
      }

      return requestFirstSuccessfulAddress(url, dependencies, addresses)
    },
    catch: (e) =>
      new FileFetchError({
        fileUrl,
        reason: String(e)
      })
  })
