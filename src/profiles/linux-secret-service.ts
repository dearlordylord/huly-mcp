import { Message, sessionBus, Variant } from "dbus-next"
import { Effect, Redacted, Schema } from "effect"

import { CliProfileStoreError } from "./model.js"
import type { NativeCredentialPort } from "./native-credential-port.js"

const SERVICE = "org.freedesktop.secrets"
const ROOT = "/org/freedesktop/secrets"
const SERVICE_INTERFACE = "org.freedesktop.Secret.Service"
const ITEM_INTERFACE = "org.freedesktop.Secret.Item"
const COLLECTION_INTERFACE = "org.freedesktop.Secret.Collection"
const ObjectPath = Schema.String.pipe(Schema.check(Schema.isPattern(/^\/(?:[A-Za-z0-9_]+(?:\/[A-Za-z0-9_]+)*)?$/u)))
const SearchReply = Schema.Tuple([Schema.Array(ObjectPath), Schema.Array(ObjectPath)])
const PromptReply = Schema.Tuple([ObjectPath, ObjectPath])
const SecretReply = Schema.Tuple([
  Schema.Tuple([
    ObjectPath,
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

export const makeLinuxSecretService = (busAddress: string | undefined): NativeCredentialPort => {
  const use = <A>(
    operation: (
      call: (
        path: string,
        iface: string,
        member: string,
        signature: string,
        body: Array<unknown>
      ) => Effect.Effect<unknown, CliProfileStoreError>
    ) => Effect.Effect<A, CliProfileStoreError>
  ) => {
    if (busAddress === undefined || busAddress === "") return Effect.fail(unavailable())
    return Effect.acquireUseRelease(
      Effect.try({
        try: () => {
          const bus = sessionBus({ busAddress })
          // Transport failures are translated by the bounded request below, never logged with payloads.
          bus.on("error", () => {})
          return bus
        },
        catch: unavailable
      }),
      (bus) =>
        operation((path, iface, member, signature, body) =>
          Effect.tryPromise({
            try: async () => {
              const reply = await bus.call(
                new Message({ destination: SERVICE, path, interface: iface, member, signature, body })
              )
              return reply?.body
            },
            catch: unavailable
          })
        ),
      (bus) => Effect.sync(() => bus.disconnect())
    ).pipe(Effect.timeout("5 seconds"), Effect.mapError(unavailable))
  }
  const parse = <A, I>(schema: Schema.Codec<A, I>, input: unknown) =>
    Schema.decodeUnknownEffect(schema)(input).pipe(Effect.mapError(unavailable))

  const attributes = (key: string) => ({ application: "huly-mcp", profile: key })
  return {
    backend: "linux-secret-service",
    read: (key) =>
      use((call) =>
        Effect.gen(function* () {
          const [unlocked, locked] = yield* parse(
            SearchReply,
            yield* call(ROOT, SERVICE_INTERFACE, "SearchItems", "a{ss}", [attributes(key)])
          )
          if (locked.length > 0 || unlocked.length > 1) return yield* unavailable()
          const item = unlocked[0]
          if (item === undefined) return undefined
          const [, session] = yield* parse(
            Schema.Tuple([Schema.Unknown, ObjectPath]),
            yield* call(ROOT, SERVICE_INTERFACE, "OpenSession", "sv", ["plain", new Variant("s", "")])
          )
          const [[, , bytes]] = yield* parse(
            SecretReply,
            yield* call(item, ITEM_INTERFACE, "GetSecret", "o", [session])
          )
          return Redacted.make(Buffer.from(bytes).toString("utf8"))
        })
      ),
    save: (key, value) =>
      use((call) =>
        Effect.gen(function* () {
          const [collection] = yield* parse(
            Schema.Tuple([ObjectPath]),
            yield* call(ROOT, SERVICE_INTERFACE, "ReadAlias", "s", ["default"])
          )
          if (collection === "/") return yield* unavailable()
          const [state] = yield* parse(
            Schema.Tuple([Schema.Struct({ value: Schema.Boolean })]),
            yield* call(collection, "org.freedesktop.DBus.Properties", "Get", "ss", [COLLECTION_INTERFACE, "Locked"])
          )
          if (state.value) return yield* unavailable()
          const [, session] = yield* parse(
            Schema.Tuple([Schema.Unknown, ObjectPath]),
            yield* call(ROOT, SERVICE_INTERFACE, "OpenSession", "sv", ["plain", new Variant("s", "")])
          )
          const [, prompt] = yield* parse(
            PromptReply,
            yield* call(collection, COLLECTION_INTERFACE, "CreateItem", "a{sv}(oayays)b", [
              {
                [`${ITEM_INTERFACE}.Label`]: new Variant("s", "Huly profile credential"),
                [`${ITEM_INTERFACE}.Attributes`]: new Variant("a{ss}", attributes(key))
              },
              [session, [], Buffer.from(Redacted.value(value), "utf8"), "text/plain; charset=utf-8"],
              true
            ])
          )
          // Never call org.freedesktop.Secret.Prompt.Prompt, including when a service requests it.
          if (prompt !== "/") return yield* unavailable()
        })
      ),
    remove: (key) =>
      use((call) =>
        Effect.gen(function* () {
          const [unlocked, locked] = yield* parse(
            SearchReply,
            yield* call(ROOT, SERVICE_INTERFACE, "SearchItems", "a{ss}", [attributes(key)])
          )
          if (locked.length > 0 || unlocked.length > 1) return yield* unavailable()
          const item = unlocked[0]
          if (item === undefined) return
          const [prompt] = yield* parse(Schema.Tuple([ObjectPath]), yield* call(item, ITEM_INTERFACE, "Delete", "", []))
          if (prompt !== "/") return yield* unavailable()
        })
      )
  }
}
