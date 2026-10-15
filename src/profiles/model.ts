import { Redacted, Schema } from "effect"

export const NonEmptyTrimmedString = Schema.Trimmed.pipe(Schema.check(Schema.isNonEmpty()))

export const ProfileNameSchema = NonEmptyTrimmedString.pipe(
  Schema.check(Schema.isPattern(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u)),
  Schema.brand("CliProfileName")
)
export type ProfileName = Schema.Schema.Type<typeof ProfileNameSchema>

export const ProfileUrlSchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter(
      (value) => {
        try {
          const url = new URL(value)
          return (url.protocol === "http:" || url.protocol === "https:") && url.username === "" && url.password === ""
        } catch {
          return false
        }
      },
      { message: "Expected an http or https URL without embedded credentials." }
    )
  )
)

export const NativeCredentialStorageSchema = Schema.Literals(["macos-keychain", "linux-secret-service"])
export type NativeCredentialStorage = Schema.Schema.Type<typeof NativeCredentialStorageSchema>
export const CredentialStorageSchema = Schema.Union([Schema.Literal("file"), NativeCredentialStorageSchema])
export type CredentialStorage = Schema.Schema.Type<typeof CredentialStorageSchema>

export const CliProfileSchema = Schema.Struct({
  credentialStorage: Schema.optionalKey(CredentialStorageSchema),
  url: ProfileUrlSchema,
  workspace: NonEmptyTrimmedString,
  defaultProject: Schema.optionalKey(NonEmptyTrimmedString)
})
export type CliProfile = Schema.Schema.Type<typeof CliProfileSchema>

export const CliProfilesFileSchema = Schema.Struct({
  version: Schema.Literal(1),
  activeProfile: Schema.optionalKey(ProfileNameSchema),
  profiles: Schema.Record(ProfileNameSchema, CliProfileSchema)
})
export type CliProfilesFile = Schema.Schema.Type<typeof CliProfilesFileSchema>

export const CredentialDestinationSchema = Schema.Struct({ url: ProfileUrlSchema, workspace: NonEmptyTrimmedString })
export type CredentialDestination = Schema.Schema.Type<typeof CredentialDestinationSchema>

export const NativeCredentialReferenceSchema = Schema.Struct({
  backend: NativeCredentialStorageSchema,
  destination: CredentialDestinationSchema,
  key: NonEmptyTrimmedString,
  retiredKeys: Schema.optionalKey(Schema.Array(NonEmptyTrimmedString))
})
export type NativeCredentialReference = Schema.Schema.Type<typeof NativeCredentialReferenceSchema>

export const CliCredentialsFileSchema = Schema.Struct({
  version: Schema.Literal(1),
  tokens: Schema.Record(ProfileNameSchema, Schema.RedactedFromValue(NonEmptyTrimmedString)),
  destinations: Schema.optionalKey(Schema.Record(ProfileNameSchema, CredentialDestinationSchema)),
  native: Schema.optionalKey(Schema.Record(ProfileNameSchema, NativeCredentialReferenceSchema))
})
export type CliCredentialsFile = Schema.Schema.Type<typeof CliCredentialsFileSchema>

export class CliProfileStoreError extends Schema.TaggedError<CliProfileStoreError>()("CliProfileStoreError", {
  kind: Schema.Literals(["input", "integration"]),
  message: Schema.String
}) {}

export const CliConnectionAuthMethodSchema = Schema.Literals(["token", "password"])
export type CliConnectionAuthMethod = Schema.Schema.Type<typeof CliConnectionAuthMethodSchema>

const ResolvedCliAuthSchema = Schema.Union([
  Schema.Struct({ method: Schema.Literal("none") }),
  Schema.Struct({ method: Schema.Literal("token"), token: Schema.Redacted(NonEmptyTrimmedString) }),
  Schema.Struct({
    method: Schema.Literal("password"),
    credentialState: Schema.Literal("email-only"),
    email: NonEmptyTrimmedString
  }),
  Schema.Struct({
    method: Schema.Literal("password"),
    credentialState: Schema.Literal("password-only"),
    password: Schema.Redacted(Schema.NonEmptyString)
  }),
  Schema.Struct({
    method: Schema.Literal("password"),
    credentialState: Schema.Literal("complete"),
    email: NonEmptyTrimmedString,
    password: Schema.Redacted(Schema.NonEmptyString)
  })
])
export type ResolvedCliAuth = Schema.Schema.Type<typeof ResolvedCliAuthSchema>

export const ResolvedCliConfigurationSchema = Schema.Struct({
  auth: ResolvedCliAuthSchema,
  url: Schema.optionalKey(ProfileUrlSchema),
  workspace: Schema.optionalKey(NonEmptyTrimmedString),
  connectionTimeout: Schema.optionalKey(NonEmptyTrimmedString),
  defaultProject: Schema.optionalKey(NonEmptyTrimmedString),
  profile: Schema.optionalKey(ProfileNameSchema)
})
export type ResolvedCliConfiguration = Schema.Schema.Type<typeof ResolvedCliConfigurationSchema>

export const storedToken = (value: string): Redacted.Redacted<string> => Redacted.make(value)
export const parseProfileName = Schema.decodeUnknownEffect(ProfileNameSchema)

export const ProfileEnvironmentSchema = Schema.Struct({
  HULY_URL: Schema.optionalKey(ProfileUrlSchema),
  HULY_WORKSPACE: Schema.optionalKey(NonEmptyTrimmedString),
  HULY_PROFILE: Schema.optionalKey(ProfileNameSchema),
  HULY_CONNECTION_TIMEOUT: Schema.optionalKey(NonEmptyTrimmedString),
  HULY_TOKEN: Schema.optionalKey(Schema.RedactedFromValue(NonEmptyTrimmedString)),
  HULY_EMAIL: Schema.optionalKey(NonEmptyTrimmedString),
  HULY_PASSWORD: Schema.optionalKey(Schema.RedactedFromValue(Schema.NonEmptyString))
})
export type ProfileEnvironment = Schema.Schema.Type<typeof ProfileEnvironmentSchema>
