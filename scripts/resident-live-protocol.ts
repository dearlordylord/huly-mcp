import { Effect, Schema } from "effect"

import { HostMessage } from "../src/resident/request-headers.js"
import { NativeDiscoverySchema } from "./integration-mcp-prior.js"
import {
  type LiveReadHostInput,
  resolveLiveReadProtocol,
  resolveLiveReadClient,
  LiveReadProbeError
} from "./resident-live-read-contract.js"

const DISCOVER_ID = 1
const LegacyInitialization = Schema.Struct({
  protocolVersion: Schema.Literal("2025-06-18"),
  capabilities: Schema.Struct({}),
  serverInfo: Schema.Struct({ name: Schema.NonEmptyString, version: Schema.NonEmptyString })
})
// Internal request/send ports. HostMessage and response schemas own the wire payloads.
type ProtocolInput = Pick<LiveReadHostInput, "protocol" | "host" | "client">
type ProtocolRequest = (
  id: NonNullable<HostMessage["id"]>,
  method: "initialize" | "server/discover",
  params: Readonly<Record<string, Schema.Json>>
) => Effect.Effect<unknown, LiveReadProbeError>
export const liveReadMetadata = (input: ProtocolInput) =>
  resolveLiveReadProtocol(input.protocol) === "2025-06-18"
    ? {}
    : {
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientCapabilities": {},
          "io.modelcontextprotocol/clientInfo": {
            name: resolveLiveReadClient(input.host, input.client).name,
            version: "1.0"
          }
        }
      }

export const discoverLiveReadProtocol = Effect.fn("discoverLiveReadProtocol")(function* (
  input: ProtocolInput,
  request: ProtocolRequest,
  send: (frame: string) => Effect.Effect<void, LiveReadProbeError>
) {
  if (resolveLiveReadProtocol(input.protocol) === "2025-06-18") {
    yield* Schema.decodeUnknownEffect(LegacyInitialization)(
      yield* request(DISCOVER_ID, "initialize", {
        protocolVersion: resolveLiveReadProtocol(input.protocol),
        capabilities: {},
        clientInfo: { name: resolveLiveReadClient(input.host, input.client).name, version: "1.0" }
      })
    ).pipe(Effect.mapError(() => new LiveReadProbeError({ phase: "discover" })))
    const frame = yield* Schema.encodeEffect(Schema.fromJsonString(HostMessage))({
      jsonrpc: "2.0",
      method: "notifications/initialized"
    }).pipe(Effect.orDie)
    yield* send(frame)
  } else {
    yield* Schema.decodeUnknownEffect(NativeDiscoverySchema)(yield* request(DISCOVER_ID, "server/discover", {})).pipe(
      Effect.mapError(() => new LiveReadProbeError({ phase: "discover" }))
    )
  }
})
