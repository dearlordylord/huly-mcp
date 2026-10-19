import { Console, Effect, Option, Schema } from "effect"
import { Argument, Command, Flag } from "effect/cli"

import { LoginRequestSchema, LocalCliService, type LocalCliPorts } from "./local-cli-ports.js"
import {
  CliProfilePatchSchema,
  createProfile,
  getAuthStatus,
  getProfileSummaries,
  logoutProfile,
  saveLogin,
  selectProfile,
  type CliProfilePatch,
  updateProfile
} from "./profile-operations.js"
import {
  type CliProfile,
  CliProfileSchema,
  CliProfileStoreError,
  parseProfileName,
  type ProfileName,
  resolveCliConfiguration
} from "./profile-store.js"
import {
  nativeBackendForPlatform,
  selectProfileStorage,
  StoragePreferenceSchema
} from "../../../src/profiles/credential-storage-policy.js"
import {
  ConnectionCheckResultSchema,
  type ConnectionCheckResult,
  TokenImportSchema,
  importLocalToken
} from "../../../src/profiles/token-management.js"
import { CliRuntimeError } from "./render.js"
import { residentCommand, residentStatusSkillSurface, residentStopSkillSurface } from "./resident-commands.js"

export { LocalCliService, type LocalCliPorts } from "./local-cli-ports.js"

const JSON_INDENT_SPACES = 2

const storeError = (error: CliProfileStoreError): CliRuntimeError =>
  new CliRuntimeError({ kind: error.kind, message: error.message, retryable: false })

const profileName = (value: string): Effect.Effect<ProfileName, CliRuntimeError> =>
  parseProfileName(value).pipe(
    Effect.mapError(
      () =>
        new CliRuntimeError({
          kind: "input",
          message: "Profile names may contain letters, digits, period, underscore, and hyphen.",
          retryable: false
        })
    )
  )

const print = (value: unknown, json: boolean): Effect.Effect<void> =>
  Console.log(
    json
      ? JSON.stringify(value, null, JSON_INDENT_SPACES)
      : typeof value === "string"
        ? value
        : JSON.stringify(value, null, JSON_INDENT_SPACES)
  )

const valueOrPrompt = (
  value: string | undefined,
  ports: LocalCliPorts,
  label: string
): Effect.Effect<string, CliRuntimeError> => (value === undefined ? ports.prompt(label) : Effect.succeed(value))

const profileForLogin = (
  ports: LocalCliPorts,
  requestedName: string | undefined
): Effect.Effect<{ readonly name: ProfileName; readonly profile: CliProfile }, CliRuntimeError> =>
  Effect.gen(function* () {
    const profiles = yield* ports.store.readProfiles().pipe(Effect.mapError(storeError))
    const name = yield* profileName(
      requestedName ?? ports.environment["HULY_PROFILE"] ?? profiles.activeProfile ?? "default"
    )
    const existing = profiles.profiles[name]
    const url = yield* valueOrPrompt(existing?.url, ports, "Huly URL")
    const workspace = yield* valueOrPrompt(existing?.workspace, ports, "Huly workspace")
    const profile = yield* Schema.decodeUnknownEffect(CliProfileSchema)({
      ...existing,
      url,
      workspace,
      ...(existing?.defaultProject === undefined ? {} : { defaultProject: existing.defaultProject })
    }).pipe(
      Effect.mapError(
        () => new CliRuntimeError({ kind: "input", message: "Huly URL or workspace is invalid.", retryable: false })
      )
    )
    return { name, profile }
  })

const optionalText = (name: string) => Flag.String(name).pipe(Flag.optional)
const jsonOption = Flag.Boolean("json").pipe(Flag.withDefault(false), Flag.withDescription("Print JSON output."))

const positionalArgument = (name: string) => ({ param: Argument.String(name), syntax: `<${name}>` })
const requiredTextFlag = (name: string, valueName = name) => ({
  param: Flag.String(name),
  syntax: `--${name} <${valueName}>`
})
const optionalTextFlag = (name: string, valueName = name) => ({
  param: optionalText(name),
  syntax: `[--${name} <${valueName}>]`
})
const optionalBooleanFlag = (name: string, param = Flag.Boolean(name).pipe(Flag.withDefault(false))) => ({
  param,
  syntax: `[--${name}]`
})

const nameArgument = positionalArgument("name")
const profileFlag = optionalTextFlag("profile", "name")
const jsonFlag = optionalBooleanFlag("json", jsonOption)
const urlFlag = requiredTextFlag("url")
const optionalUrlFlag = optionalTextFlag("url")
const workspaceFlag = requiredTextFlag("workspace")
const optionalWorkspaceFlag = optionalTextFlag("workspace")
const defaultProjectFlag = optionalTextFlag("default-project", "project")
const clearDefaultProjectFlag = optionalBooleanFlag("clear-default-project")

const storageFlag = {
  param: Flag.Literals("storage", StoragePreferenceSchema.literals).pipe(Flag.optional),
  syntax: `[--storage ${StoragePreferenceSchema.literals.join("|")}]`
}

const localCommandConfigs = {
  authImport: {
    storage: storageFlag.param,
    profile: profileFlag.param,
    json: jsonFlag.param,
    stdin: Flag.Boolean("stdin").pipe(Flag.withDefault(false))
  },
  authCheck: { profile: profileFlag.param, json: jsonFlag.param },
  authLogin: { profile: profileFlag.param, json: jsonFlag.param, storage: storageFlag.param },
  authStatus: { profile: profileFlag.param, json: jsonOption },
  authLogout: { profile: profileFlag.param, json: jsonFlag.param },
  profileCreate: {
    name: nameArgument.param,
    url: urlFlag.param,
    workspace: workspaceFlag.param,
    defaultProject: defaultProjectFlag.param,
    json: jsonFlag.param
  },
  profileList: { json: jsonOption },
  profileSelect: { name: nameArgument.param, json: jsonFlag.param },
  profileUpdate: {
    name: nameArgument.param,
    url: optionalUrlFlag.param,
    workspace: optionalWorkspaceFlag.param,
    defaultProject: defaultProjectFlag.param,
    clearDefaultProject: clearDefaultProjectFlag.param,
    json: jsonFlag.param
  }
} as const

const stripOuterBrackets = (syntax: string): string => syntax.slice("[".length, syntax.length - "]".length)

export const localCommandSkillSurfaces = {
  residentStatus: residentStatusSkillSurface,
  residentStop: residentStopSkillSurface,
  authImport: `huly auth import-token ${storageFlag.syntax} ${profileFlag.syntax} [--stdin] ${jsonFlag.syntax}`,
  authCheck: `huly auth check ${profileFlag.syntax} ${jsonFlag.syntax}`,
  authLogin: `huly auth login ${storageFlag.syntax} ${profileFlag.syntax} ${jsonFlag.syntax}`,
  authStatus: `huly auth status ${profileFlag.syntax} ${jsonFlag.syntax}`,
  authLogout: `huly auth logout ${profileFlag.syntax} ${jsonFlag.syntax}`,
  profileCreate: `huly profile create ${nameArgument.syntax} ${urlFlag.syntax} ${workspaceFlag.syntax} ${defaultProjectFlag.syntax} ${jsonFlag.syntax}`,
  profileList: `huly profile list ${jsonFlag.syntax}`,
  profileSelect: `huly profile select ${nameArgument.syntax} ${jsonFlag.syntax}`,
  profileUpdate:
    `huly profile update ${nameArgument.syntax} ${optionalUrlFlag.syntax} ${optionalWorkspaceFlag.syntax} ` +
    `[${stripOuterBrackets(defaultProjectFlag.syntax)} | ${stripOuterBrackets(clearDefaultProjectFlag.syntax)}] ${jsonFlag.syntax}`
} as const
const optionValue = <A>(value: Option.Option<A>): A | undefined => Option.getOrUndefined(value)

const hasProfilePatch = (
  url: Option.Option<string>,
  workspace: Option.Option<string>,
  defaultProject: Option.Option<string>,
  clearDefaultProject: boolean
): boolean => Option.isSome(url) || Option.isSome(workspace) || Option.isSome(defaultProject) || clearDefaultProject

const profilePatch = (
  url: Option.Option<string>,
  workspace: Option.Option<string>,
  defaultProject: Option.Option<string>,
  clearDefaultProject: boolean
): Effect.Effect<CliProfilePatch, CliRuntimeError> =>
  Schema.decodeUnknownEffect(CliProfilePatchSchema)({
    ...Option.match(url, { onNone: () => ({}), onSome: (value) => ({ url: value }) }),
    ...Option.match(workspace, { onNone: () => ({}), onSome: (value) => ({ workspace: value }) }),
    ...(clearDefaultProject
      ? { defaultProject: null }
      : Option.match(defaultProject, { onNone: () => ({}), onSome: (value) => ({ defaultProject: value }) }))
  }).pipe(
    Effect.mapError(
      () => new CliRuntimeError({ kind: "input", message: "Invalid profile update values.", retryable: false })
    )
  )

const authLogin = Command.make("login", localCommandConfigs.authLogin, ({ json, profile, storage }) =>
  Effect.gen(function* () {
    const ports = yield* LocalCliService
    const target = yield* profileForLogin(ports, optionValue(profile))
    const destination = yield* selectProfileStorage(
      ports.store,
      target.name,
      target.profile,
      optionValue(storage),
      nativeBackendForPlatform(ports.platform)
    ).pipe(Effect.mapError(storeError))
    const email = yield* ports.prompt("Huly email")
    const password = yield* ports.promptSecret("Huly password")
    const request = yield* Schema.decodeUnknownEffect(LoginRequestSchema)({ ...target.profile, email, password }).pipe(
      Effect.mapError(
        () => new CliRuntimeError({ kind: "input", message: "Email or password is empty.", retryable: false })
      )
    )
    const token = yield* ports.authenticate(request)
    yield* saveLogin(ports.store, target.name, destination, token).pipe(Effect.mapError(storeError))
    yield* print(`Logged in to Huly profile '${target.name}'.`, json)
  })
).pipe(Command.withDescription("Log in interactively and store only the resulting token."))

const authStatus = Command.make("status", localCommandConfigs.authStatus, ({ json, profile }) =>
  Effect.gen(function* () {
    const ports = yield* LocalCliService
    const status = yield* getAuthStatus(ports.store, ports.environment, optionValue(profile)).pipe(
      Effect.mapError(storeError)
    )
    yield* print(status, json)
  })
).pipe(Command.withDescription("Show sanitized authentication and configuration status."))

const authLogout = Command.make("logout", localCommandConfigs.authLogout, ({ json, profile }) =>
  Effect.gen(function* () {
    const ports = yield* LocalCliService
    const selected = optionValue(profile) ?? ports.environment["HULY_PROFILE"]
    const requested = selected === undefined ? undefined : yield* profileName(selected)
    const name = yield* logoutProfile(ports.store, requested).pipe(Effect.mapError(storeError))
    yield* print(`Logged out of Huly profile '${name}'.`, json)
  })
).pipe(Command.withDescription("Remove the stored token for a profile."))

const authImport = Command.make("import-token", localCommandConfigs.authImport, ({ json, profile, stdin, storage }) =>
  Effect.gen(function* () {
    const ports = yield* LocalCliService
    const profiles = yield* ports.store.readProfiles().pipe(Effect.mapError(storeError))
    const requested = optionValue(profile) ?? ports.environment["HULY_PROFILE"] ?? profiles.activeProfile
    if (requested === undefined)
      return yield* new CliRuntimeError({
        kind: "input",
        message: "Create and select a profile before importing a token.",
        retryable: false
      })
    const name = yield* profileName(requested)
    const target = profiles.profiles[name]
    if (target === undefined)
      return yield* new CliRuntimeError({
        kind: "input",
        message: "Selected Huly profile does not exist.",
        retryable: false
      })
    const destination = yield* selectProfileStorage(
      ports.store,
      name,
      target,
      optionValue(storage),
      nativeBackendForPlatform(ports.platform)
    ).pipe(Effect.mapError(storeError))
    const token = stdin ? yield* ports.readTokenStdin() : yield* ports.promptSecret("Huly token")
    const request = yield* Schema.decodeUnknownEffect(TokenImportSchema)({ name, destination: target, token }).pipe(
      Effect.mapError(
        () =>
          new CliRuntimeError({ kind: "input", message: "Token must be a nonempty single value.", retryable: false })
      )
    )
    yield* importLocalToken(request, {
      save: (value) => saveLogin(ports.store, name, destination, value.token),
      read: (value) =>
        ports
          .checkConnection({
            auth: { method: "token", token: value.token },
            url: value.destination.url,
            workspace: value.destination.workspace
          })
          .pipe(Effect.mapError((error) => new CliProfileStoreError({ kind: "integration", message: error.message })))
    }).pipe(Effect.mapError(storeError))
    yield* print(`Imported and verified token for Huly profile '${name}'.`, json)
  })
).pipe(
  Command.withDescription(
    "Import a token using hidden terminal input or explicitly selected --stdin; verify before saving. Never pass a token as an argument."
  )
)

const authCheck = Command.make("check", localCommandConfigs.authCheck, ({ json, profile }) =>
  Effect.gen(function* () {
    const ports = yield* LocalCliService
    const configuration = yield* resolveCliConfiguration(ports.store, ports.environment, optionValue(profile)).pipe(
      Effect.mapError(storeError)
    )
    yield* ports.checkConnection(configuration)
    const result: ConnectionCheckResult = {
      verified: true,
      ...(configuration.profile === undefined ? {} : { profile: configuration.profile })
    }
    yield* print(Schema.encodeSync(ConnectionCheckResultSchema)(result), json)
  })
).pipe(
  Command.withDescription("Explicitly check Huly connectivity with a bounded live read. Does not save credentials.")
)

export const authCommand = Command.make("auth").pipe(
  Command.withDescription("Authentication commands"),
  Command.withSubcommands([authLogin, authImport, authCheck, authStatus, authLogout])
)

const profileCreate = Command.make(
  "create",
  localCommandConfigs.profileCreate,
  ({ defaultProject, json, name, url, workspace }) =>
    Effect.gen(function* () {
      const ports = yield* LocalCliService
      const parsedName = yield* profileName(name)
      const profile = yield* Schema.decodeUnknownEffect(CliProfileSchema)({
        url,
        workspace,
        ...(Option.isNone(defaultProject) ? {} : { defaultProject: defaultProject.value })
      }).pipe(
        Effect.mapError(
          () => new CliRuntimeError({ kind: "input", message: "Invalid profile values.", retryable: false })
        )
      )
      yield* createProfile(ports.store, parsedName, profile).pipe(Effect.mapError(storeError))
      yield* print(`Created Huly profile '${parsedName}'.`, json)
    })
).pipe(Command.withDescription("Create a named URL and workspace profile."))

const profileList = Command.make("list", localCommandConfigs.profileList, ({ json }) =>
  Effect.gen(function* () {
    const ports = yield* LocalCliService
    const rows = yield* getProfileSummaries(ports.store).pipe(Effect.mapError(storeError))
    yield* print(rows.length === 0 && !json ? "No Huly CLI profiles." : rows, json)
  })
).pipe(Command.withDescription("List named profiles without exposing credentials."))

const profileSelect = Command.make("select", localCommandConfigs.profileSelect, ({ json, name }) =>
  Effect.gen(function* () {
    const ports = yield* LocalCliService
    const parsedName = yield* profileName(name)
    yield* selectProfile(ports.store, parsedName).pipe(Effect.mapError(storeError))
    yield* print(`Selected Huly profile '${parsedName}'.`, json)
  })
).pipe(Command.withDescription("Select the active profile."))

const profileUpdate = Command.make(
  "update",
  localCommandConfigs.profileUpdate,
  ({ clearDefaultProject, defaultProject, json, name, url, workspace }) =>
    Effect.gen(function* () {
      const ports = yield* LocalCliService
      const parsedName = yield* profileName(name)
      if (!hasProfilePatch(url, workspace, defaultProject, clearDefaultProject)) {
        return yield* new CliRuntimeError({
          kind: "input",
          message: "Profile update has no changes.",
          retryable: false
        })
      }
      const patch = yield* profilePatch(url, workspace, defaultProject, clearDefaultProject)
      yield* updateProfile(ports.store, parsedName, patch).pipe(Effect.mapError(storeError))
      yield* print(`Updated Huly profile '${parsedName}'.`, json)
    })
).pipe(Command.withDescription("Update a named profile."))

export const profileCommand = Command.make("profile").pipe(
  Command.withDescription("Named Huly context profiles"),
  Command.withSubcommands([profileCreate, profileList, profileSelect, profileUpdate])
)

export const localCliCommands = [authCommand, profileCommand, residentCommand]
