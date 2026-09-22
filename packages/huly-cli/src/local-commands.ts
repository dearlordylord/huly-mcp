import * as os from "node:os"
import * as readline from "node:readline/promises"
import { Writable } from "node:stream"

import { Console, Context, Effect, Layer, Option, Redacted, Schema } from "effect"
import { Argument, Command, Flag } from "effect/unstable/cli"

import { HulySdk } from "../../../src/huly/sdk-deps.js"
import {
  CliProfilePatchSchema,
  createProfile,
  getAuthStatus,
  logoutProfile,
  saveLogin,
  selectProfile,
  type CliProfilePatch,
  updateProfile
} from "./profile-operations.js"
import {
  type CliProfile,
  CliProfileSchema,
  type CliProfileStore,
  type CliProfileStoreError,
  cliProfilePaths,
  makeCliProfileStore,
  parseProfileName,
  type ProfileName
} from "./profile-store.js"
import { CliRuntimeError } from "./render.js"

const JSON_INDENT_SPACES = 2

const LoginRequestSchema = Schema.Struct({
  url: CliProfileSchema.fields.url,
  workspace: CliProfileSchema.fields.workspace,
  email: Schema.Trimmed.pipe(Schema.check(Schema.isNonEmpty())),
  password: Schema.RedactedFromValue(Schema.NonEmptyString)
})
type LoginRequest = Schema.Schema.Type<typeof LoginRequestSchema>

export interface LocalCliPorts {
  readonly authenticate: (request: LoginRequest) => Effect.Effect<Redacted.Redacted<string>, CliRuntimeError>
  readonly environment: NodeJS.ProcessEnv
  readonly prompt: (label: string, hidden: boolean) => Effect.Effect<string, CliRuntimeError>
  readonly store: CliProfileStore
}

export class LocalCliService extends Context.Service<LocalCliService, LocalCliPorts>()("@huly-cli/LocalCliService") {
  static readonly defaultLayer = Layer.sync(LocalCliService, defaultLocalCliPorts)
}

/* c8 ignore start -- production TTY and Huly SDK adapters are exercised by the final live integration; command behavior uses LocalCliPorts in unit tests. */
class PromptOutput extends Writable {
  muted = false

  override _write(chunk: Buffer | string, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    if (!this.muted) process.stdout.write(chunk, encoding)
    callback()
  }
}

const promptValue = (label: string, hidden: boolean): Effect.Effect<string, CliRuntimeError> =>
  Effect.tryPromise({
    try: async () => {
      const output = new PromptOutput()
      const terminal = readline.createInterface({ input: process.stdin, output, terminal: true })
      process.stdout.write(`${label}: `)
      output.muted = hidden
      const value = await terminal.question("")
      output.muted = false
      process.stdout.write("\n")
      terminal.close()
      return value
    },
    catch: () => new CliRuntimeError({ kind: "input", message: `Unable to read ${label}.`, retryable: false })
  })

const authenticate = (request: LoginRequest): Effect.Effect<Redacted.Redacted<string>, CliRuntimeError> =>
  Effect.gen(function* () {
    const sdk = yield* HulySdk
    return yield* Effect.tryPromise({
      try: async () => {
        const server = await sdk.loadServerConfig(request.url)
        const login = await sdk
          .getAccountClient(server.ACCOUNTS_URL)
          .login(request.email, Redacted.value(request.password))
        if (login.token === undefined) throw new Error("Huly login returned no token")
        const workspace = await sdk
          .getAccountClient(server.ACCOUNTS_URL, login.token)
          .selectWorkspace(request.workspace)
        return Redacted.make(workspace.token)
      },
      catch: () =>
        new CliRuntimeError({
          kind: "authentication",
          message: "Huly login failed. Check the URL, workspace, email, and password.",
          retryable: false
        })
    })
  }).pipe(Effect.provide(HulySdk.defaultLayer))
/* c8 ignore stop */

function defaultLocalCliPorts(): LocalCliPorts {
  return {
    authenticate,
    environment: process.env,
    prompt: promptValue,
    store: makeCliProfileStore(cliProfilePaths(process.platform, process.env, os.homedir()))
  }
}

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
): Effect.Effect<string, CliRuntimeError> => (value === undefined ? ports.prompt(label, false) : Effect.succeed(value))

const profileForLogin = (
  ports: LocalCliPorts,
  requestedName: string | undefined
): Effect.Effect<{ readonly name: ProfileName; readonly profile: CliProfile }, CliRuntimeError> =>
  Effect.gen(function* () {
    const profiles = yield* ports.store.readProfiles().pipe(Effect.mapError(storeError))
    const name = yield* profileName(requestedName ?? profiles.activeProfile ?? "default")
    const existing = profiles.profiles[name]
    const url = yield* valueOrPrompt(existing?.url, ports, "Huly URL")
    const workspace = yield* valueOrPrompt(existing?.workspace, ports, "Huly workspace")
    const profile = yield* Schema.decodeUnknownEffect(CliProfileSchema)({
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

const localCommandConfigs = {
  authLogin: { profile: profileFlag.param, json: jsonFlag.param },
  authStatus: { json: jsonOption },
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
  authLogin: `huly auth login ${profileFlag.syntax} ${jsonFlag.syntax}`,
  authStatus: `huly auth status ${jsonFlag.syntax}`,
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

const authLogin = Command.make("login", localCommandConfigs.authLogin, ({ json, profile }) =>
  Effect.gen(function* () {
    const ports = yield* LocalCliService
    const target = yield* profileForLogin(ports, optionValue(profile))
    const email = yield* ports.prompt("Huly email", false)
    const password = yield* ports.prompt("Huly password", true)
    const request = yield* Schema.decodeUnknownEffect(LoginRequestSchema)({ ...target.profile, email, password }).pipe(
      Effect.mapError(
        () => new CliRuntimeError({ kind: "input", message: "Email or password is empty.", retryable: false })
      )
    )
    const token = yield* ports.authenticate(request)
    yield* saveLogin(ports.store, target.name, target.profile, token).pipe(Effect.mapError(storeError))
    yield* print(`Logged in to Huly profile '${target.name}'.`, json)
  })
).pipe(Command.withDescription("Log in interactively and store only the resulting token."))

const authStatus = Command.make("status", localCommandConfigs.authStatus, ({ json }) =>
  Effect.gen(function* () {
    const ports = yield* LocalCliService
    const status = yield* getAuthStatus(ports.store, ports.environment).pipe(Effect.mapError(storeError))
    yield* print(status, json)
  })
).pipe(Command.withDescription("Show sanitized authentication and configuration status."))

const authLogout = Command.make("logout", localCommandConfigs.authLogout, ({ json, profile }) =>
  Effect.gen(function* () {
    const ports = yield* LocalCliService
    const requested = Option.isNone(profile) ? undefined : yield* profileName(profile.value)
    const name = yield* logoutProfile(ports.store, requested).pipe(Effect.mapError(storeError))
    yield* print(`Logged out of Huly profile '${name}'.`, json)
  })
).pipe(Command.withDescription("Remove the stored token for a profile."))

export const authCommand = Command.make("auth").pipe(
  Command.withDescription("Authentication commands"),
  Command.withSubcommands([authLogin, authStatus, authLogout])
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
    const profiles = yield* ports.store.readProfiles().pipe(Effect.mapError(storeError))
    const credentials = yield* ports.store.readCredentials().pipe(Effect.mapError(storeError))
    const rows = Object.entries(profiles.profiles).map(([name, profile]) => ({
      name,
      active: name === profiles.activeProfile,
      authenticated: Object.hasOwn(credentials.tokens, name),
      ...profile
    }))
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

export const localCliCommands = [authCommand, profileCommand]
