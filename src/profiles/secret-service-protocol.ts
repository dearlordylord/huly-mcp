import type * as Dbus from "dbus-next"
import { Redacted, Schema } from "effect"

export const SECRET_SERVICE = "org.freedesktop.secrets"
export const SECRET_ROOT = "/org/freedesktop/secrets"
export const SECRET_SERVICE_INTERFACE = "org.freedesktop.Secret.Service"
export const SECRET_ITEM_INTERFACE = "org.freedesktop.Secret.Item"
export const SECRET_COLLECTION_INTERFACE = "org.freedesktop.Secret.Collection"
export const SecretObjectPathSchema = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^\/(?:[A-Za-z0-9_]+(?:\/[A-Za-z0-9_]+)*)?$/u))
)

// These are the complete supported outbound operations. Their wire signatures and
// tuple encodings are colocated below; callers cannot supply arbitrary D-Bus calls.
export const SecretServiceRequestSchema = Schema.Union([
  Schema.TaggedStruct("SearchItems", { key: Schema.NonEmptyString }),
  Schema.TaggedStruct("OpenSession", {}),
  Schema.TaggedStruct("ReadDefaultCollection", {}),
  Schema.TaggedStruct("CollectionLocked", { collection: SecretObjectPathSchema }),
  Schema.TaggedStruct("GetSecret", { item: SecretObjectPathSchema, session: SecretObjectPathSchema }),
  Schema.TaggedStruct("CreateItem", {
    collection: SecretObjectPathSchema,
    session: SecretObjectPathSchema,
    key: Schema.NonEmptyString,
    secret: Schema.Redacted(Schema.NonEmptyString)
  }),
  Schema.TaggedStruct("DeleteItem", { item: SecretObjectPathSchema })
])
export type SecretServiceRequest = Schema.Schema.Type<typeof SecretServiceRequestSchema>

// Internal SDK port: the library owns Variant/Message marshaling; the schema above
// owns every application request. Secrets are unwrapped only in this encoder.
type DbusSdk = Pick<typeof Dbus, "Message" | "Variant">

const attributes = (key: string) => ({ application: "huly-mcp", profile: key })

export const encodeSecretServiceMessage = (request: SecretServiceRequest, sdk: DbusSdk) => {
  const service = { destination: SECRET_SERVICE, path: SECRET_ROOT, interface: SECRET_SERVICE_INTERFACE }
  switch (request._tag) {
    case "SearchItems":
      return new sdk.Message({ ...service, member: "SearchItems", signature: "a{ss}", body: [attributes(request.key)] })
    case "OpenSession":
      return new sdk.Message({
        ...service,
        member: "OpenSession",
        signature: "sv",
        body: ["plain", new sdk.Variant("s", "")]
      })
    case "ReadDefaultCollection":
      return new sdk.Message({ ...service, member: "ReadAlias", signature: "s", body: ["default"] })
    case "CollectionLocked":
      return new sdk.Message({
        destination: SECRET_SERVICE,
        path: request.collection,
        interface: "org.freedesktop.DBus.Properties",
        member: "Get",
        signature: "ss",
        body: [SECRET_COLLECTION_INTERFACE, "Locked"]
      })
    case "GetSecret":
      return new sdk.Message({
        destination: SECRET_SERVICE,
        path: request.item,
        interface: SECRET_ITEM_INTERFACE,
        member: "GetSecret",
        signature: "o",
        body: [request.session]
      })
    case "CreateItem":
      return new sdk.Message({
        destination: SECRET_SERVICE,
        path: request.collection,
        interface: SECRET_COLLECTION_INTERFACE,
        member: "CreateItem",
        signature: "a{sv}(oayays)b",
        body: [
          {
            [`${SECRET_ITEM_INTERFACE}.Label`]: new sdk.Variant("s", "Huly profile credential"),
            [`${SECRET_ITEM_INTERFACE}.Attributes`]: new sdk.Variant("a{ss}", attributes(request.key))
          },
          [request.session, [], Buffer.from(Redacted.value(request.secret), "utf8"), "text/plain; charset=utf-8"],
          true
        ]
      })
    case "DeleteItem":
      return new sdk.Message({
        destination: SECRET_SERVICE,
        path: request.item,
        interface: SECRET_ITEM_INTERFACE,
        member: "Delete",
        signature: "",
        body: []
      })
  }
}
