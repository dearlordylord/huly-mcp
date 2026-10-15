import * as os from "node:os"
import * as readline from "node:readline/promises"
import { Writable } from "node:stream"
import { Context, Effect, Layer, Redacted, Schema } from "effect"
import { makeNativeCredentials } from "../../../src/profiles/native-credentials.js"
import { HulySdk } from "../../../src/huly/sdk-deps.js"
import { checkHulyConnection } from "../../../src/profiles/connection-check.js"
import {
  type ResolvedCliConfiguration,
  type CliProfileStore,
  CliProfileSchema,
  cliProfilePaths,
  makeCliProfileStore
} from "./profile-store.js"
import { CliRuntimeError } from "./render.js"

export const LoginRequestSchema = Schema.Struct({
  url: CliProfileSchema.fields.url,
  workspace: CliProfileSchema.fields.workspace,
  email: Schema.Trimmed.pipe(Schema.check(Schema.isNonEmpty())),
  password: Schema.RedactedFromValue(Schema.NonEmptyString)
})
type LoginRequest = Schema.Schema.Type<typeof LoginRequestSchema>

export interface LocalCliPorts {
  readonly authenticate: (request: LoginRequest) => Effect.Effect<Redacted.Redacted<string>, CliRuntimeError>
  readonly checkConnection: (configuration: ResolvedCliConfiguration) => Effect.Effect<void, CliRuntimeError>
  readonly readTokenStdin: () => Effect.Effect<string, CliRuntimeError>
  readonly platform: NodeJS.Platform
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
      if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Terminal input required")
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
    catch: () =>
      new CliRuntimeError({
        kind: "input",
        message: `Unable to read ${label} from a terminal. For token import, explicitly select --stdin.`,
        retryable: false
      })
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
    platform: process.platform,
    authenticate,
    checkConnection: (configuration) =>
      checkHulyConnection(configuration).pipe(
        Effect.mapError((error) => new CliRuntimeError({ kind: error.kind, message: error.message, retryable: false }))
      ),
    readTokenStdin: () =>
      Effect.tryPromise({
        try: async () => {
          const chunks: Array<Buffer> = []
          for await (const chunk of process.stdin) {
            chunks.push(Buffer.from(chunk))
          }
          return Buffer.concat(chunks).toString("utf8").trim()
        },
        catch: () => new CliRuntimeError({ kind: "input", message: "Cannot read token from stdin.", retryable: false })
      }),
    environment: process.env,
    prompt: promptValue,
    store: makeCliProfileStore(
      cliProfilePaths(process.platform, process.env, os.homedir()),
      makeNativeCredentials(process.platform, process.env)
    )
  }
}
