import { Effect, Schema } from "effect"

import { CredentialDestinationSchema, CliProfileStoreError, ProfileNameSchema } from "./model.js"

export const TokenImportSchema = Schema.Struct({
  name: ProfileNameSchema,
  destination: CredentialDestinationSchema,
  token: Schema.Redacted(Schema.Trimmed.pipe(Schema.check(Schema.isNonEmpty(), Schema.isPattern(/^\S+$/u))))
})
export type TokenImport = Schema.Schema.Type<typeof TokenImportSchema>

export const ConnectionCheckResultSchema = Schema.Struct({
  verified: Schema.Literal(true),
  profile: Schema.optionalKey(ProfileNameSchema)
})
export type ConnectionCheckResult = Schema.Schema.Type<typeof ConnectionCheckResultSchema>

// Internal live-read port. Requests have already been parsed by TokenImportSchema.
export interface TokenVerification {
  readonly read: (request: TokenImport) => Effect.Effect<void, CliProfileStoreError>
}

export const verifyLocalToken = Effect.fn("Profiles.verifyLocalToken")(function* (
  request: TokenImport,
  verification: TokenVerification
) {
  yield* verification.read(request).pipe(
    Effect.timeout("10 seconds"),
    Effect.mapError((error) =>
      error instanceof CliProfileStoreError
        ? error
        : new CliProfileStoreError({
            kind: "integration",
            message: "Huly connection check failed or timed out. Check the destination, token, and connectivity."
          })
    )
  )
})

// Internal application port: persistence selects the profile's shared credential backend.
export interface TokenImportPorts extends TokenVerification {
  readonly save: (request: TokenImport) => Effect.Effect<void, CliProfileStoreError>
}

export const importLocalToken = Effect.fn("Profiles.importLocalToken")(function* (
  request: TokenImport,
  ports: TokenImportPorts
) {
  yield* verifyLocalToken(request, ports)
  yield* ports.save(request)
})
