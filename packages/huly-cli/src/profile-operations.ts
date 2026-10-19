import { matchesCredentialDestination } from "../../../src/profiles/credential-destination.js"
import { type CredentialStoreSelector, selectCredentialStore } from "../../../src/profiles/credential-store.js"
import { Effect, Record, type Redacted, Schema } from "effect"

import {
  type CliProfile,
  type CredentialStorage,
  CredentialStorageSchema,
  type NativeCredentialReference,
  CliProfileSchema,
  type CliProfilesFile,
  type CliCredentialsFile,
  type CliProfileStore,
  CliProfileStoreError,
  type ProfileName,
  ProfileNameSchema,
  type ResolvedCliConfiguration,
  resolveCliConfiguration
} from "./profile-store.js"

const CliAuthStatusFields = {
  verified: Schema.Literal(false),
  credentialStorage: Schema.optionalKey(CliProfileSchema.fields.credentialStorage),
  profile: Schema.optionalKey(ProfileNameSchema),
  url: Schema.optionalKey(CliProfileSchema.fields.url),
  workspace: Schema.optionalKey(CliProfileSchema.fields.workspace),
  defaultProject: Schema.optionalKey(Schema.Trimmed.pipe(Schema.check(Schema.isNonEmpty()))),
  sources: Schema.Struct({
    url: Schema.Literals(["environment", "profile", "missing"]),
    workspace: Schema.Literals(["environment", "profile", "missing"]),
    authentication: Schema.Literals(["environment", "profile", "missing"])
  })
}

export const CliAuthStatusSchema = Schema.Union([
  Schema.Struct({
    ...CliAuthStatusFields,
    authenticated: Schema.Literal(false),
    configured: Schema.Literal(false),
    authMethod: Schema.Literal("none")
  }),
  Schema.Struct({
    ...CliAuthStatusFields,
    authenticated: Schema.Literal(true),
    configured: Schema.Literal(true),
    authMethod: Schema.Literals(["token", "password"])
  })
])
export type CliAuthStatus = Schema.Schema.Type<typeof CliAuthStatusSchema>

const ProfileSummaryFields = {
  ...CliProfileSchema.fields,
  name: ProfileNameSchema,
  active: Schema.Boolean,
  verified: Schema.Literal(false),
  credentialStorage: CredentialStorageSchema
}
export const CliProfileSummariesSchema = Schema.Array(
  Schema.Union([
    Schema.Struct({ ...ProfileSummaryFields, configured: Schema.Literal(true), authenticated: Schema.Literal(true) }),
    Schema.Struct({ ...ProfileSummaryFields, configured: Schema.Literal(false), authenticated: Schema.Literal(false) })
  ])
)

const fileCredentialConfigured = (credentials: CliCredentialsFile, name: ProfileName, profile: CliProfile): boolean => {
  const binding = credentials.destinations?.[name]
  return (
    credentials.tokens[name] !== undefined && binding !== undefined && matchesCredentialDestination(binding, profile)
  )
}

const profileCredentialConfigured = (
  credentials: CliCredentialsFile,
  name: ProfileName,
  profile: CliProfile
): boolean => {
  if ((profile.credentialStorage ?? "file") === "file") return fileCredentialConfigured(credentials, name, profile)
  return nativeReferenceMatches(credentials.native?.[name], profile.credentialStorage, profile)
}

export const getProfileSummaries = Effect.fn("Profiles.summaries")(function* (store: CliProfileStore) {
  const profiles = yield* store.readProfiles()
  const credentials = yield* store.readCredentials()
  return Schema.decodeUnknownSync(CliProfileSummariesSchema)(
    Record.toEntries(profiles.profiles).map(([name, profile]) => {
      const backend = profile.credentialStorage ?? "file"
      const configured = profileCredentialConfigured(credentials, name, profile)
      return {
        ...profile,
        name,
        active: name === profiles.activeProfile,
        credentialStorage: backend,
        verified: false,
        configured,
        authenticated: configured
      }
    })
  )
})

export const CliProfilePatchSchema = Schema.Struct({
  defaultProject: Schema.optionalKey(
    Schema.Union([Schema.Trimmed.pipe(Schema.check(Schema.isNonEmpty())), Schema.Null])
  ),
  url: Schema.optionalKey(CliProfileSchema.fields.url),
  workspace: Schema.optionalKey(CliProfileSchema.fields.workspace)
})
export type CliProfilePatch = Schema.Schema.Type<typeof CliProfilePatchSchema>

const missingProfile = (name: ProfileName): CliProfileStoreError =>
  new CliProfileStoreError({ kind: "input", message: `Huly CLI profile '${name}' does not exist.` })

const existingProfile = (name: ProfileName): CliProfileStoreError =>
  new CliProfileStoreError({ kind: "input", message: `Huly CLI profile '${name}' already exists.` })

const withActiveProfile = (profiles: CliProfilesFile, name: ProfileName, profile: CliProfile): CliProfilesFile => ({
  ...profiles,
  activeProfile: profiles.activeProfile ?? name,
  profiles: { ...profiles.profiles, [name]: profile }
})

export const createProfile = (
  store: CliProfileStore,
  name: ProfileName,
  profile: CliProfile
): Effect.Effect<void, CliProfileStoreError> =>
  Effect.gen(function* () {
    const profiles = yield* store.readProfiles()
    if (profiles.profiles[name] !== undefined) return yield* existingProfile(name)
    yield* store.writeProfiles(withActiveProfile(profiles, name, profile))
  })

const applyProfilePatch = (profile: CliProfile, patch: CliProfilePatch): CliProfile => ({
  ...(profile.credentialStorage === undefined ? {} : { credentialStorage: profile.credentialStorage }),
  url: patch.url ?? profile.url,
  workspace: patch.workspace ?? profile.workspace,
  ...(patch.defaultProject === null
    ? {}
    : patch.defaultProject === undefined
      ? profile.defaultProject === undefined
        ? {}
        : { defaultProject: profile.defaultProject }
      : { defaultProject: patch.defaultProject })
})

export const updateProfile = (
  store: CliProfileStore,
  name: ProfileName,
  patch: CliProfilePatch
): Effect.Effect<void, CliProfileStoreError> =>
  Effect.gen(function* () {
    const profiles = yield* store.readProfiles()
    const current = profiles.profiles[name]
    if (current === undefined) return yield* missingProfile(name)
    const updated = yield* Schema.decodeUnknownEffect(CliProfileSchema)(applyProfilePatch(current, patch)).pipe(
      Effect.mapError(
        () => new CliProfileStoreError({ kind: "input", message: `Huly CLI profile '${name}' is invalid.` })
      )
    )
    yield* store.writeProfiles({ ...profiles, profiles: { ...profiles.profiles, [name]: updated } })
  })

export const selectProfile = (store: CliProfileStore, name: ProfileName): Effect.Effect<void, CliProfileStoreError> =>
  Effect.gen(function* () {
    const profiles = yield* store.readProfiles()
    if (profiles.profiles[name] === undefined) return yield* missingProfile(name)
    yield* store.writeProfiles({ ...profiles, activeProfile: name })
  })

export const saveLogin = (
  store: CliProfileStore,
  name: ProfileName,
  profile: CliProfile,
  token: Redacted.Redacted<string>,
  credentialStore: CredentialStoreSelector = selectCredentialStore
): Effect.Effect<void, CliProfileStoreError> =>
  Effect.gen(function* () {
    const profiles = yield* store.readProfiles()
    yield* store.writeProfiles({ ...withActiveProfile(profiles, name, profile), activeProfile: name })
    yield* credentialStore(store)
      .save(name, profile, token, profile.credentialStorage)
      .pipe(Effect.catch((error) => store.writeProfiles(profiles).pipe(Effect.andThen(Effect.fail(error)))))
  })

export const logoutProfile = (
  store: CliProfileStore,
  requestedName?: ProfileName,
  credentialStore: CredentialStoreSelector = selectCredentialStore
): Effect.Effect<ProfileName, CliProfileStoreError> =>
  Effect.gen(function* () {
    const profiles = yield* store.readProfiles()
    const name = requestedName ?? profiles.activeProfile
    if (name === undefined || profiles.profiles[name] === undefined) {
      return yield* new CliProfileStoreError({ kind: "input", message: "No active Huly CLI profile." })
    }
    yield* credentialStore(store).remove(name)
    return name
  })

const source = (
  environmentValue: string | undefined,
  profileValue: string | undefined
): CliAuthStatus["sources"]["url"] =>
  environmentValue !== undefined ? "environment" : profileValue !== undefined ? "profile" : "missing"

const authMethod = (resolved: ResolvedCliConfiguration): CliAuthStatus["authMethod"] => {
  if (resolved.auth.method === "token") return "token"
  if (resolved.auth.method === "none") return "none"
  return resolved.auth.credentialState === "complete" ? "password" : "none"
}

const optionalStatusFields = (resolved: ResolvedCliConfiguration) => {
  return {
    ...(resolved.profile === undefined ? {} : { profile: resolved.profile }),
    ...(resolved.url === undefined ? {} : { url: resolved.url }),
    ...(resolved.workspace === undefined ? {} : { workspace: resolved.workspace }),
    ...(resolved.defaultProject === undefined ? {} : { defaultProject: resolved.defaultProject })
  }
}

const authStatusSources = (
  environment: NodeJS.ProcessEnv,
  profile: CliProfile | undefined,
  selected: ProfileName | undefined,
  method: CliAuthStatus["authMethod"]
): CliAuthStatus["sources"] => ({
  url: source(environment["HULY_URL"], profile?.url),
  workspace: source(environment["HULY_WORKSPACE"], profile?.workspace),
  authentication: source(
    environment["HULY_TOKEN"] ?? environment["HULY_EMAIL"] ?? environment["HULY_PASSWORD"],
    method === "token" ? selected : undefined
  )
})

const makeAuthStatus = (
  profiles: CliProfilesFile,
  resolved: ResolvedCliConfiguration,
  environment: NodeJS.ProcessEnv,
  nativeConfigured = false
): CliAuthStatus => {
  const profile = resolved.profile === undefined ? undefined : profiles.profiles[resolved.profile]
  const method = nativeConfigured && resolved.auth.method === "none" ? "token" : authMethod(resolved)
  return Schema.decodeUnknownSync(CliAuthStatusSchema)({
    verified: false,
    authenticated: method !== "none",
    configured: method !== "none",
    authMethod: method,
    ...optionalStatusFields(resolved),
    ...(profile === undefined ? {} : { credentialStorage: profile.credentialStorage ?? "file" }),
    sources: authStatusSources(environment, profile, resolved.profile, method)
  })
}

const nativeReferenceMatches = (
  reference: NativeCredentialReference | undefined,
  storage: CredentialStorage | undefined,
  configuration: Pick<ResolvedCliConfiguration, "url" | "workspace">
): boolean =>
  reference !== undefined &&
  reference.backend === storage &&
  matchesCredentialDestination(reference.destination, configuration)

const nativeConfiguredForStatus = Effect.fn("Profiles.nativeConfiguredForStatus")(function* (
  store: CliProfileStore,
  configuration: ResolvedCliConfiguration,
  profile: CliProfile | undefined
) {
  if (configuration.auth.method !== "none") return false
  if (configuration.profile === undefined) return false
  if ((profile?.credentialStorage ?? "file") === "file") return false
  const credentials = yield* store.readCredentials()
  return nativeReferenceMatches(credentials.native?.[configuration.profile], profile?.credentialStorage, configuration)
})

export const getAuthStatus = (
  store: CliProfileStore,
  environment: NodeJS.ProcessEnv,
  requestedName?: string
): Effect.Effect<CliAuthStatus, CliProfileStoreError> =>
  Effect.gen(function* () {
    const profiles = yield* store.readProfiles()
    const resolved = yield* resolveCliConfiguration(
      store,
      environment,
      requestedName,
      true,
      (storage) => ({
        ...selectCredentialStore(storage),
        read: (name, destination) =>
          Effect.gen(function* () {
            const selected = profiles.profiles[name]
            if (selected?.credentialStorage !== undefined && selected.credentialStorage !== "file") return undefined
            return yield* selectCredentialStore(storage).read(name, destination)
          })
      }),
      false
    )
    const selected = resolved.profile === undefined ? undefined : profiles.profiles[resolved.profile]
    const configured = yield* nativeConfiguredForStatus(store, resolved, selected)
    return makeAuthStatus(profiles, resolved, environment, configured)
  })
