import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { expect } from "vitest"

import { fetchFromUrl, isBlockedUrl, requestUrl } from "../../src/huly/url-fetch.js"

const LOOPBACK = { address: "127.0.0.1", family: 4 } as const

// Run `fn` against a real local HTTP server (a genuine dependency, not a mock).
const withServer = async (
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  fn: (url: URL) => Promise<void>
): Promise<void> => {
  const server = createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  const port = typeof address === "object" && address !== null ? address.port : 0
  try {
    await fn(new URL(`http://127.0.0.1:${port}/file`))
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

// Structural shape of the (unexported) FetchFromUrlDependencies — passed positionally to fetchFromUrl.
interface ResolvedAddress {
  readonly address: string
  readonly family: 4 | 6
}
interface Deps {
  readonly resolveHostname: (hostname: string) => Promise<ReadonlyArray<ResolvedAddress>>
  readonly requestUrl: (url: URL, address: ResolvedAddress) => Promise<Buffer>
}

const unusedRequestUrl = (): Promise<Buffer> => Promise.reject(new Error("requestUrl must not be called"))
const unusedResolveHostname = (): Promise<ReadonlyArray<ResolvedAddress>> =>
  Promise.reject(new Error("resolveHostname must not be called"))

describe("isBlockedUrl", () => {
  const blocked = [
    // non-http protocol + special hostnames
    "ftp://example.com/file",
    "http://localhost/",
    "http://metadata.google.internal/computeMetadata",
    "::not a url::",
    // blocked IPv4 ranges
    "http://0.0.0.1/",
    "http://10.1.2.3/",
    "http://100.64.0.1/",
    "http://127.0.0.1/",
    "http://169.254.1.1/",
    "http://172.16.5.5/",
    "http://192.0.0.1/",
    "http://192.0.2.5/",
    "http://192.168.1.1/",
    "http://198.18.0.1/",
    "http://198.19.0.1/",
    "http://198.51.100.1/",
    "http://203.0.113.1/",
    "http://224.0.0.1/",
    "http://240.0.0.1/",
    "http://255.255.255.255/",
    // blocked IPv6
    "http://[::]/",
    "http://[::1]/",
    "http://[fc00::1]/",
    "http://[fe80::1]/",
    "http://[1000::1]/",
    "http://[4001::1]/",
    "http://[1:2:3:4:5:6:7:8]/",
    // IPv4-mapped IPv6 (dotted + hextet form)
    "http://[::ffff:10.0.0.1]/",
    "http://[::ffff:0a00:0001]/",
    "http://[::ffff:ffff:ffff]/",
    // malformed IPv6 (parsing edge cases)
    "http://[1::2::3]/",
    "http://[gggg::]/",
    "http://[::ffff:zzzz]/",
    "http://[12345::1]/",
    "http://[1:2:3:4:5:6:7]/",
    "http://[1:2:3:4:5:6:7:8:9]/",
    "http://[::1:2:3:4:5:6:7:8]/",
    // documentation prefix 2001:db8::/32 (full 8-hextet form)
    "http://[2001:db8:1:2:3:4:5:6]/"
  ]

  const allowed = [
    "http://8.8.8.8/",
    "https://93.184.216.34/",
    "http://[2001:4860:4860::8888]/",
    // global unicast, full 8-hextet form, not a special-use prefix
    "http://[2606:4700:4700:1111:2222:3333:4444:5555]/",
    "http://example.com/file"
  ]

  for (const url of blocked) {
    it(`blocks ${url}`, () => {
      expect(isBlockedUrl(url)).toBe(true)
    })
  }

  for (const url of allowed) {
    it(`allows ${url}`, () => {
      expect(isBlockedUrl(url)).toBe(false)
    })
  }
})

describe("fetchFromUrl", () => {
  const publicAddress: ResolvedAddress = { address: "8.8.8.8", family: 4 }

  it.effect("rejects a blocked URL before any resolution", () =>
    Effect.gen(function*() {
      const deps: Deps = { resolveHostname: unusedResolveHostname, requestUrl: unusedRequestUrl }
      const error = yield* Effect.flip(fetchFromUrl("http://127.0.0.1/file", deps))
      expect(error._tag).toBe("FileFetchError")
      expect(error.reason).toContain("URL blocked")
    }))

  it.effect("rejects when the hostname does not resolve", () =>
    Effect.gen(function*() {
      const deps: Deps = { resolveHostname: async () => [], requestUrl: unusedRequestUrl }
      const error = yield* Effect.flip(fetchFromUrl("http://example.com/file", deps))
      expect(error.reason).toContain("did not resolve")
    }))

  it.effect("rejects when DNS resolves to a blocked address", () =>
    Effect.gen(function*() {
      const deps: Deps = {
        resolveHostname: async () => [{ address: "10.0.0.1", family: 4 }],
        requestUrl: unusedRequestUrl
      }
      const error = yield* Effect.flip(fetchFromUrl("http://example.com/file", deps))
      expect(error.reason).toContain("internal/private/non-global address")
    }))

  // DNS-resolved addresses are not URL-validated, so these reach the IPv6/IPv4 parsers directly
  // (a bracketed literal would be rejected by `new URL` first).
  const blockedResolvedAddresses: ReadonlyArray<ResolvedAddress> = [
    { address: "not-an-ip", family: 4 }, // unparseable IPv4
    { address: "256.1.1.1", family: 4 }, // octet above 255
    { address: "-1.1.1.1", family: 4 }, // octet below 0
    { address: "fc00::1", family: 6 }, // ULA IPv6
    { address: "::ffff:127.0.0.1", family: 6 }, // IPv4-mapped loopback (dotted)
    { address: "::ffff:0a00:0001", family: 6 }, // IPv4-mapped loopback (hextet)
    { address: "::ffff:zzzz", family: 6 }, // mapped form with an invalid hextet
    { address: "::a", family: 6 }, // leading "::" first hextet below global range
    { address: "12345::1", family: 6 }, // hextet too long
    { address: "1:2:3:4:5:6:7", family: 6 }, // too few hextets
    { address: "1:2:3:4:5:6:7:8:9", family: 6 }, // too many hextets
    { address: "::1:2:3:4:5:6:7:8", family: 6 }, // compression leaves no zero gap
    { address: "gggg::", family: 6 }, // invalid hextet
    { address: "1::2::3", family: 6 }, // two compression markers
    { address: "1.2.3.4", family: 6 } // dotted form routed through the IPv6 parser
  ]
  for (const address of blockedResolvedAddresses) {
    it.effect(`rejects a resolved ${address.family === 4 ? "IPv4" : "IPv6"} address ${address.address}`, () =>
      Effect.gen(function*() {
        const deps: Deps = { resolveHostname: async () => [address], requestUrl: unusedRequestUrl }
        const error = yield* Effect.flip(fetchFromUrl("http://example.com/file", deps))
        expect(error.reason).toContain("internal/private/non-global address")
      }))
  }

  it.effect("returns the body on success", () =>
    Effect.gen(function*() {
      const deps: Deps = {
        resolveHostname: async () => [publicAddress],
        requestUrl: async () => Buffer.from("payload")
      }
      const result = yield* fetchFromUrl("http://example.com/file", deps)
      expect(result.toString()).toBe("payload")
    }))

  it.effect("falls through to the next address when the first request fails", () =>
    Effect.gen(function*() {
      let calls = 0
      const deps: Deps = {
        resolveHostname: async () => [publicAddress, { address: "9.9.9.9", family: 4 }],
        requestUrl: async () => {
          calls += 1
          if (calls === 1) throw new Error("connection reset")
          return Buffer.from("second")
        }
      }
      const result = yield* fetchFromUrl("http://example.com/file", deps)
      expect(result.toString()).toBe("second")
      expect(calls).toBe(2)
    }))

  it.effect("fails after exhausting every resolved address", () =>
    Effect.gen(function*() {
      const deps: Deps = {
        resolveHostname: async () => [publicAddress, { address: "9.9.9.9", family: 4 }],
        requestUrl: async () => {
          throw new Error("connection reset")
        }
      }
      const error = yield* Effect.flip(fetchFromUrl("http://example.com/file", deps))
      expect(error.reason).toContain("Request failed for all resolved addresses")
    }))
})

describe("requestUrl", () => {
  it("returns the body of a 2xx response", async () => {
    await withServer((_req, res) => {
      res.writeHead(200)
      res.end("hello body")
    }, async (url) => {
      const buffer = await requestUrl(url, LOOPBACK)
      expect(buffer.toString()).toBe("hello body")
    })
  })

  it("rejects on a non-2xx status", async () => {
    await withServer((_req, res) => {
      res.writeHead(404)
      res.end("missing")
    }, async (url) => {
      await expect(requestUrl(url, LOOPBACK)).rejects.toThrow("HTTP 404")
    })
  })

  it("rejects when the response exceeds the byte limit", async () => {
    await withServer((_req, res) => {
      res.writeHead(200)
      res.end("x".repeat(1000))
    }, async (url) => {
      await expect(requestUrl(url, LOOPBACK, 16)).rejects.toThrow("exceeded maximum file size")
    })
  })

  it("uses the pinned lookup when the URL host is a name", async () => {
    await withServer((_req, res) => {
      res.writeHead(200)
      res.end("pinned")
    }, async (url) => {
      // a hostname URL forces Node to call the pinned DNS lookup that resolves to the server
      const hostUrl = new URL(`http://localhost:${url.port}/file`)
      const buffer = await requestUrl(hostUrl, LOOPBACK)
      expect(buffer.toString()).toBe("pinned")
    })
  })

  it("rejects when the connection cannot be established", async () => {
    let closedPortUrl = new URL("http://127.0.0.1/file")
    await withServer((_req, res) => res.end(), async (url) => {
      closedPortUrl = url
    })
    // the server is now closed; the pinned connection is refused
    await expect(requestUrl(closedPortUrl, LOOPBACK)).rejects.toThrow()
  })

  it("selects the https agent for https URLs", async () => {
    await withServer((_req, res) => res.end("plaintext"), async (url) => {
      // a plain-HTTP server cannot complete a TLS handshake, but the https branch is taken first
      const httpsUrl = new URL(`https://127.0.0.1:${url.port}/file`)
      await expect(requestUrl(httpsUrl, LOOPBACK)).rejects.toThrow()
    })
  })
})
