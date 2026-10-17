import { NodeHttpServer } from "@effect/platform-node"
import { constants, randomBytes } from "node:crypto"
import { Agent, createServer, type RequestOptions } from "node:https"
import type { Duplex } from "node:stream"
import { connect, type SecureContextOptions, type TLSSocket } from "node:tls"
import { Effect, Redacted, Schema } from "effect"

import { type HttpServerFactory, HttpTransportError } from "../mcp/http-transport.js"
import { BackendResponseError } from "./response-stream.js"

const GENERATION_UUID_VERSION = 4
const TLS_TICKET_KEY_BYTES = 48
const TLS_IDENTITY_PREFIX = "@firfi/huly-mcp/resident-tls/v1/"

export const ResidentTlsIdentity = Schema.Struct({
  generation: Schema.String.check(Schema.isUUID(GENERATION_UUID_VERSION)).pipe(Schema.brand("ResidentGeneration")),
  key: Schema.RedactedFromValue(Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)))
})
export type ResidentTlsIdentity = Schema.Schema.Type<typeof ResidentTlsIdentity>

export const ResidentEndpoint = Schema.URLFromString.check(
  Schema.makeFilter(
    (url) =>
      url.protocol === "https:" &&
      ["127.0.0.1", "[::1]"].includes(url.hostname) &&
      url.port !== "0" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === "" &&
      url.pathname === "/mcp"
  )
)
export type ResidentEndpoint = Schema.Schema.Type<typeof ResidentEndpoint>

const TLS_POLICY = {
  minVersion: "TLSv1.3",
  maxVersion: "TLSv1.3",
  ciphers: "TLS_AES_128_GCM_SHA256"
} satisfies SecureContextOptions
const CHANNEL_FAILURE = "Resident TLS channel could not authenticate the expected generation"

class ResidentAgent extends Agent {
  private readonly ownedSockets = new Set<TLSSocket>()
  private closed = false
  private readonly key: Buffer

  constructor(
    private readonly endpoint: ResidentEndpoint,
    private readonly identity: ResidentTlsIdentity
  ) {
    super({ keepAlive: false, maxCachedSessions: 0, maxSockets: 1, maxTotalSockets: 1 })
    this.key = Buffer.from(Redacted.value(identity.key), "hex")
  }

  override createConnection(
    _options: RequestOptions,
    callback?: (error: Error | null, stream: Duplex) => void
  ): undefined {
    if (callback === undefined) throw new Error("Resident HTTPS requires asynchronous socket handoff")
    let suppliedExternalKey = false
    const socket = connect({
      ...TLS_POLICY,
      host: this.endpoint.hostname === "[::1]" ? "::1" : "127.0.0.1",
      port: Number(this.endpoint.port || "443"),
      rejectUnauthorized: true,
      pskCallback: () => {
        suppliedExternalKey = true
        return { psk: this.key, identity: `${TLS_IDENTITY_PREFIX}${this.identity.generation}` }
      },
      checkServerIdentity: () => new Error(CHANNEL_FAILURE)
    })
    this.ownedSockets.add(socket)
    let completed = false
    const complete = (error: Error | null) => {
      if (completed) return
      completed = true
      callback(error, socket)
    }
    socket.once("error", () => complete(new Error(CHANNEL_FAILURE)))
    socket.once("close", () => {
      this.ownedSockets.delete(socket)
      complete(new Error(CHANNEL_FAILURE))
    })
    socket.once("secureConnect", () => {
      if (
        this.closed ||
        !suppliedExternalKey ||
        socket.getProtocol() !== TLS_POLICY.minVersion ||
        socket.getCipher().standardName !== TLS_POLICY.ciphers ||
        Object.keys(socket.getPeerCertificate()).length !== 0
      )
        socket.destroy(new Error(CHANNEL_FAILURE))
      else complete(null)
    })
    if (this.closed) socket.destroy(new Error(CHANNEL_FAILURE))
    return undefined
  }

  closeOwned() {
    this.closed = true
    const closed = Array.from(
      this.ownedSockets,
      (socket) =>
        new Promise<void>((resolve) => {
          if (socket.closed) resolve()
          else socket.once("close", () => resolve())
          socket.destroy(new Error("Resident exchange scope closed"))
        })
    )
    super.destroy()
    return Promise.all(closed).then(() => this.key.fill(0))
  }
}

export const withResidentHttpsAgent = <A, E, R>(
  endpoint: ResidentEndpoint,
  identity: ResidentTlsIdentity,
  use: (agent: Agent) => Effect.Effect<A, E, R>
) =>
  Effect.acquireUseRelease(
    Effect.sync(() => new ResidentAgent(endpoint, identity)),
    use,
    (agent) =>
      Effect.promise(() => agent.closeOwned()).pipe(
        Effect.interruptible,
        Effect.timeoutOrElse({
          duration: "5 seconds",
          orElse: () => Effect.fail(new BackendResponseError({ message: "Resident TLS socket cleanup timed out" }))
        }),
        Effect.asVoid
      )
  )

export const makeResidentHttpServerFactory = (identity: ResidentTlsIdentity): HttpServerFactory => ({
  protocol: "https",
  make: (port, host, gracefulShutdownTimeout) => {
    if (host !== "127.0.0.1" && host !== "::1")
      return Effect.fail(new HttpTransportError({ message: "Resident listener requires a literal loopback binding" }))
    return NodeHttpServer.make(
      () => {
        const approved = new WeakSet<TLSSocket>()
        const key = Buffer.from(Redacted.value(identity.key), "hex")
        const server = createServer({
          ...TLS_POLICY,
          secureOptions: constants.SSL_OP_NO_TICKET,
          ticketKeys: randomBytes(TLS_TICKET_KEY_BYTES),
          pskCallback: (socket, channelIdentity) => {
            if (channelIdentity !== `${TLS_IDENTITY_PREFIX}${identity.generation}`) return null
            approved.add(socket)
            return key
          }
        })
        server.prependListener("secureConnection", (socket) => {
          if (!approved.has(socket)) socket.destroy()
        })
        return server
      },
      { port, host, ...(gracefulShutdownTimeout === undefined ? {} : { gracefulShutdownTimeout }) }
    ).pipe(Effect.mapError(() => new HttpTransportError({ message: "Resident TLS listener could not start" })))
  }
})
