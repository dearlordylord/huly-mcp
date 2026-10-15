import { Effect, Redacted, Schema } from "effect"

import { CliProfileStoreError } from "./model.js"
import type { NativeCredentialPort } from "./native-credential-port.js"
import {
  encodeSecretServiceMessage,
  SecretObjectPathSchema,
  type SecretServiceRequest,
  SecretServiceRequestSchema
} from "./secret-service-protocol.js"

const SearchReply = Schema.Tuple([Schema.Array(SecretObjectPathSchema), Schema.Array(SecretObjectPathSchema)])
const PromptReply = Schema.Tuple([SecretObjectPathSchema, Schema.Literal("/")])
const SessionReply = Schema.Tuple([Schema.Unknown, SecretObjectPathSchema])
const SecretReply = Schema.Tuple([
  Schema.Tuple([
    SecretObjectPathSchema,
    Schema.Unknown,
    Schema.Union([
      Schema.Uint8Array,
      Schema.Array(Schema.Int.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 255 }))))
    ]),
    Schema.String
  ])
])

const unavailable = () =>
  new CliProfileStoreError({
    kind: "integration",
    message:
      "Linux Secret Service is locked, unavailable, or requires interaction. Unlock the desktop collection and run CLI/MCP in the same user's D-Bus session, or explicitly inject complete environment credentials. No file fallback was used."
  })

type SecretCall = (request: SecretServiceRequest) => Effect.Effect<unknown, CliProfileStoreError>

// Internal transport port. Request and reply schemas own payloads; this port owns lifetime.
export interface SecretServiceConnection {
  readonly call: SecretCall
  readonly close: Effect.Effect<void>
}
export type SecretServiceConnect = (address: string) => Effect.Effect<SecretServiceConnection, CliProfileStoreError>

const connectSecretService: SecretServiceConnect = (address) =>
  Effect.tryPromise({
    try: async () => {
      const sdk = await import("dbus-next")
      const bus = sdk.sessionBus({ busAddress: address })
      // Transport errors become bounded request failures, never payload-bearing logs.
      bus.on("error", () => {})
      return {
        call: (request: SecretServiceRequest) =>
          Schema.encodeEffect(SecretServiceRequestSchema)(request).pipe(
            Effect.mapError(unavailable),
            Effect.flatMap((encoded) =>
              Effect.tryPromise({
                try: async () => (await bus.call(encodeSecretServiceMessage(encoded, sdk)))?.body,
                catch: unavailable
              })
            )
          ),
        close: Effect.sync(() => bus.disconnect())
      }
    },
    catch: unavailable
  })

export const makeLinuxSecretService = (
  busAddress: string | undefined,
  connect: SecretServiceConnect = connectSecretService
): NativeCredentialPort => {
  const use = <A>(operation: (call: SecretCall) => Effect.Effect<A, CliProfileStoreError>) =>
    Effect.gen(function* () {
      const address = yield* Schema.decodeUnknownEffect(Schema.NonEmptyString)(busAddress).pipe(
        Effect.mapError(unavailable)
      )
      return yield* Effect.acquireUseRelease(
        connect(address),
        ({ call }) => operation(call),
        ({ close }) => close
      )
    }).pipe(Effect.timeout("5 seconds"), Effect.mapError(unavailable))
  const parse = <A, I>(schema: Schema.Codec<A, I>, input: unknown) =>
    Schema.decodeUnknownEffect(schema)(input).pipe(Effect.mapError(unavailable))
  return {
    backend: "linux-secret-service",
    read: (key) =>
      use((call) =>
        Effect.gen(function* () {
          const [unlocked, locked] = yield* parse(SearchReply, yield* call({ _tag: "SearchItems", key }))
          if (locked.length > 0 || unlocked.length > 1) return yield* unavailable()
          const item = unlocked[0]
          if (item === undefined) return undefined
          const [, session] = yield* parse(SessionReply, yield* call({ _tag: "OpenSession" }))
          const [[, , bytes]] = yield* parse(SecretReply, yield* call({ _tag: "GetSecret", item, session }))
          return Redacted.make(Buffer.from(bytes).toString("utf8"))
        })
      ),
    save: (key, secret) =>
      use((call) =>
        Effect.gen(function* () {
          const [collection] = yield* parse(
            Schema.Tuple([SecretObjectPathSchema]),
            yield* call({ _tag: "ReadDefaultCollection" })
          )
          if (collection === "/") return yield* unavailable()
          const [state] = yield* parse(
            Schema.Tuple([Schema.Struct({ value: Schema.Boolean })]),
            yield* call({ _tag: "CollectionLocked", collection })
          )
          if (state.value) return yield* unavailable()
          const [, session] = yield* parse(SessionReply, yield* call({ _tag: "OpenSession" }))
          // A non-root prompt object is refused by the reply schema. Prompt is never invoked.
          yield* parse(PromptReply, yield* call({ _tag: "CreateItem", collection, session, key, secret }))
        })
      ),
    remove: (key) =>
      use((call) =>
        Effect.gen(function* () {
          const [unlocked, locked] = yield* parse(SearchReply, yield* call({ _tag: "SearchItems", key }))
          if (locked.length > 0 || unlocked.length > 1) return yield* unavailable()
          const item = unlocked[0]
          if (item === undefined) return
          yield* parse(Schema.Tuple([Schema.Literal("/")]), yield* call({ _tag: "DeleteItem", item }))
        })
      )
  }
}
