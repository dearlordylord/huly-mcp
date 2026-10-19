import { Schema } from "effect"
import { CliProfileStoreError } from "./model.js"

export const MACOS_KEYCHAIN_SERVICE = "io.github.dearlordylord.huly-mcp"
export const MACOS_KEYCHAIN_ITEM_NOT_FOUND = 44
export const MacosSecurityRequestSchema = Schema.Union([
  Schema.TaggedStruct("Locate", { key: Schema.NonEmptyString }),
  Schema.TaggedStruct("Remove", { key: Schema.NonEmptyString })
])
export type MacosSecurityRequest = Schema.Schema.Type<typeof MacosSecurityRequestSchema>
export const MacosSecurityReplySchema = Schema.Struct({
  status: Schema.Int,
  output: Schema.RedactedFromValue(Schema.String)
})
export type MacosSecurityReply = Schema.Schema.Type<typeof MacosSecurityReplySchema>

export const macosKeychainUnavailable = () =>
  new CliProfileStoreError({
    kind: "integration",
    message:
      "macOS Keychain access failed. Unlock the credential's Keychain and check the current OS user/session and search list, or explicitly inject complete environment credentials. macOS controls access prompts, including after updates. No file fallback was used."
  })

export const macosSecurityArguments = (request: MacosSecurityRequest): ReadonlyArray<string> => [
  request._tag === "Locate" ? "find-generic-password" : "delete-generic-password",
  "-s",
  MACOS_KEYCHAIN_SERVICE,
  "-a",
  request.key
]
