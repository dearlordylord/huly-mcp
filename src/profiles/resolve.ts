import { Effect, type Redacted, Schema } from "effect"
import { type CredentialStoreSelector, selectCredentialStore } from "./credential-store.js"
import { type CliProfileStore } from "./file-store.js"
import {
  type ProfileEnvironment,
  ProfileEnvironmentSchema,
  type CliProfile,
  type CliCredentialsFile,
  type ProfileName,
  type ResolvedCliAuth,
  type ResolvedCliConfiguration,
  ResolvedCliConfigurationSchema,
  ProfileNameSchema,
  CliProfileStoreError
} from "./model.js"

const parseEnvironment = (environment: NodeJS.ProcessEnv) =>
  Schema.decodeUnknownEffect(ProfileEnvironmentSchema)(
    Object.fromEntries(Object.entries(environment).filter(([, value]) => value !== undefined && value !== ""))
  ).pipe(
    Effect.mapError(
      () => new CliProfileStoreError({ kind: "input", message: "Invalid resolved Huly CLI configuration." })
    )
  )

const resolvedAuth = (
  environment: ProfileEnvironment,
  token: Redacted.Redacted<string> | undefined
): ResolvedCliAuth => {
  const environmentToken = environment.HULY_TOKEN
  if (environmentToken !== undefined) return { method: "token", token: environmentToken }
  const email = environment.HULY_EMAIL
  const password = environment.HULY_PASSWORD
  if (email !== undefined && password !== undefined) {
    return { method: "password", credentialState: "complete", email, password }
  }
  if (email !== undefined) return { method: "password", credentialState: "email-only", email }
  if (password !== undefined) {
    return { method: "password", credentialState: "password-only", password }
  }
  return token === undefined ? { method: "none" } : { method: "token", token }
}

const resolvedEndpointFields = (environment: ProfileEnvironment, profile: CliProfile | undefined) => {
  const url = environment.HULY_URL ?? profile?.url
  const workspace = environment.HULY_WORKSPACE ?? profile?.workspace
  const connectionTimeout = environment.HULY_CONNECTION_TIMEOUT
  return {
    ...(url === undefined ? {} : { url }),
    ...(workspace === undefined ? {} : { workspace }),
    ...(connectionTimeout === undefined ? {} : { connectionTimeout })
  }
}

const resolvedProfileFields = (name: ProfileName | undefined, profile: CliProfile | undefined) => ({
  ...(profile?.defaultProject === undefined ? {} : { defaultProject: profile.defaultProject }),
  ...(name === undefined ? {} : { profile: name })
})

const tokenForProfile = (
  name: ProfileName | undefined,
  credentials: CliCredentialsFile
): Redacted.Redacted<string> | undefined => (name === undefined ? undefined : credentials.tokens[name])

const resolvedConfiguration = (
  name: ProfileName | undefined,
  profile: CliProfile | undefined,
  credentials: CliCredentialsFile,
  environment: ProfileEnvironment
): Effect.Effect<ResolvedCliConfiguration, CliProfileStoreError> => {
  return Schema.decodeUnknownEffect(ResolvedCliConfigurationSchema)({
    auth: resolvedAuth(environment, tokenForProfile(name, credentials)),
    ...resolvedEndpointFields(environment, profile),
    ...resolvedProfileFields(name, profile)
  }).pipe(
    Effect.mapError(
      () => new CliProfileStoreError({ kind: "input", message: "Invalid resolved Huly CLI configuration." })
    )
  )
}

const inputError = (message: string) => new CliProfileStoreError({ kind: "input", message })

const hasEnvironmentCredentials = (environment: ProfileEnvironment): boolean =>
  environment.HULY_EMAIL !== undefined ||
  environment.HULY_PASSWORD !== undefined ||
  environment.HULY_TOKEN !== undefined

const completeEnvironment = (environment: ProfileEnvironment): boolean =>
  environment.HULY_URL !== undefined &&
  environment.HULY_WORKSPACE !== undefined &&
  (environment.HULY_TOKEN !== undefined ||
    (environment.HULY_EMAIL !== undefined && environment.HULY_PASSWORD !== undefined))

const selectProfile = Effect.fn("Profiles.select")(function* (store: CliProfileStore, requested: string | undefined) {
  const name =
    requested === undefined
      ? undefined
      : yield* Schema.decodeUnknownEffect(ProfileNameSchema)(requested).pipe(
          Effect.mapError(() => inputError("Invalid Huly profile name."))
        )
  const profiles = yield* store.readProfiles()
  const selectedName = name ?? profiles.activeProfile
  const profile = selectedName === undefined ? undefined : profiles.profiles[selectedName]
  if (selectedName !== undefined && profile === undefined)
    return yield* inputError("Selected Huly profile does not exist.")
  return { name: selectedName, profile }
})

const resolveSavedCredential = Effect.fn("Profiles.resolveSavedCredential")(function* (
  store: CliProfileStore,
  environment: ProfileEnvironment,
  name: ProfileName | undefined,
  profile: CliProfile | undefined,
  credentialStore: CredentialStoreSelector
) {
  if (name === undefined || profile === undefined) return { version: 1, tokens: {} } satisfies CliCredentialsFile
  const destination = { ...profile, ...resolvedEndpointFields(environment, profile) }
  if (destination.url !== profile.url || destination.workspace !== profile.workspace) {
    return yield* inputError(
      "Saved Huly credential destination changed. Run huly auth login for this profile, or supply complete environment credentials and destination."
    )
  }
  const token = yield* credentialStore(store).read(name, profile)
  return { version: 1, tokens: token === undefined ? {} : { [name]: token } } satisfies CliCredentialsFile
})

const requireSelectedCredential = (
  requested: string | undefined,
  resolved: ResolvedCliConfiguration,
  required: boolean
): Effect.Effect<ResolvedCliConfiguration, CliProfileStoreError> => {
  if (!required || requested === undefined) return Effect.succeed(resolved)
  // Selected profiles reach this point only after complete environment overrides or bound-store lookup.
  if (resolved.auth.method !== "none") return Effect.succeed(resolved)
  return Effect.fail(
    inputError(
      "Selected Huly profile has no usable credentials. Run huly auth login for this profile or supply complete environment credentials."
    )
  )
}

const requireCompleteOverride = (
  name: ProfileName | undefined,
  environment: ProfileEnvironment
): Effect.Effect<void, CliProfileStoreError> =>
  name !== undefined && hasEnvironmentCredentials(environment) && !completeEnvironment(environment)
    ? Effect.fail(inputError("Profile credential overrides require complete environment credentials and destination."))
    : Effect.void

const requestedEnvironment = (environment: NodeJS.ProcessEnv, name: string | undefined) =>
  parseEnvironment(name === undefined ? environment : { ...environment, HULY_PROFILE: undefined })

export const resolveCliConfiguration = Effect.fn("Profiles.resolveConfiguration")(function* (
  store: CliProfileStore,
  rawEnvironment: NodeJS.ProcessEnv,
  requestedName?: string,
  useActiveProfile = true,
  credentialStore: CredentialStoreSelector = selectCredentialStore,
  requireCredentials = true
) {
  const environment = yield* requestedEnvironment(rawEnvironment, requestedName)
  const requested = requestedName ?? environment.HULY_PROFILE
  if (!useActiveProfile && requested === undefined) {
    return yield* resolvedConfiguration(undefined, undefined, { version: 1, tokens: {} }, environment)
  }
  const selected = yield* selectProfile(store, requested)
  yield* requireCompleteOverride(selected.name, environment)
  const credentials = completeEnvironment(environment)
    ? ({ version: 1, tokens: {} } satisfies CliCredentialsFile)
    : yield* resolveSavedCredential(store, environment, selected.name, selected.profile, credentialStore)
  const resolved = yield* resolvedConfiguration(selected.name, selected.profile, credentials, environment)
  return yield* requireSelectedCredential(requested, resolved, requireCredentials)
})
