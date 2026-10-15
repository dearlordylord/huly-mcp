import { Message, Variant } from "dbus-next"
import { Redacted, Result, Schema } from "effect"
import { expect, it } from "vitest"

import { encodeSecretServiceMessage, SecretServiceRequestSchema } from "../../src/profiles/secret-service-protocol.js"

it("encodes the supported Secret Service operations with their exact wire signatures", () => {
  const requests = [
    { _tag: "SearchItems", key: "profile" },
    { _tag: "OpenSession" },
    { _tag: "ReadDefaultCollection" },
    { _tag: "CollectionLocked", collection: "/collection" },
    { _tag: "GetSecret", item: "/item", session: "/session" },
    {
      _tag: "CreateItem",
      collection: "/collection",
      session: "/session",
      key: "profile",
      secret: Redacted.make("wire-sentinel")
    },
    { _tag: "DeleteItem", item: "/item" }
  ]
  const messages = requests.map((request) =>
    encodeSecretServiceMessage(Schema.decodeUnknownSync(SecretServiceRequestSchema)(request), { Message, Variant })
  )
  expect(messages.map(({ member, signature }) => ({ member, signature }))).toEqual([
    { member: "SearchItems", signature: "a{ss}" },
    { member: "OpenSession", signature: "sv" },
    { member: "ReadAlias", signature: "s" },
    { member: "Get", signature: "ss" },
    { member: "GetSecret", signature: "o" },
    { member: "CreateItem", signature: "a{sv}(oayays)b" },
    { member: "Delete", signature: "" }
  ])
  expect(messages.every(({ destination }) => destination === "org.freedesktop.secrets")).toBe(true)
})

it("refuses unsupported calls and malformed object paths at the outbound boundary", () => {
  expect(Result.isFailure(Schema.decodeUnknownResult(SecretServiceRequestSchema)({ _tag: "Prompt" }))).toBe(true)
  expect(
    Result.isFailure(Schema.decodeUnknownResult(SecretServiceRequestSchema)({ _tag: "DeleteItem", item: "not/a/path" }))
  ).toBe(true)
})
