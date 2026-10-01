import * as fs from "node:fs/promises"
import * as path from "node:path"

import { Effect, Result, Schema } from "effect"

import {
  type CliCredentialsFile,
  CliCredentialsFileSchema,
  type CliProfilesFile,
  CliProfilesFileSchema,
  CliProfileStoreError
} from "./model.js"

const CONFIG_DIRECTORY_MODE = 0o700
const CONFIG_FILE_MODE = 0o600
const JSON_INDENT_SPACES = 2

class CliFileReadError extends Schema.TaggedError<CliFileReadError>()("CliFileReadError", {
  missing: Schema.Boolean
}) {}

// Internal adapter locations, not a serialized payload. File schemas own the stored contracts.
export interface CliProfilePaths {
  readonly credentials: string
  readonly directory: string
  readonly profiles: string
}

const emptyProfiles = (): CliProfilesFile => ({ version: 1, profiles: {} })
const emptyCredentials = (): CliCredentialsFile => ({ version: 1, tokens: {} })

const nodeErrorSchema = Schema.Struct({ code: Schema.optionalKey(Schema.String) })

const isMissingFile = (error: unknown): boolean => {
  const decoded = Schema.decodeUnknownResult(nodeErrorSchema)(error)
  return Result.isSuccess(decoded) && decoded.success.code === "ENOENT"
}

const configBaseDirectory = (
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv,
  homeDirectory: string
): string => {
  if (platform === "win32") return path.join(environment["APPDATA"] ?? homeDirectory, "huly")
  if (platform === "darwin") return path.join(homeDirectory, "Library", "Application Support", "huly")
  return path.join(environment["XDG_CONFIG_HOME"] ?? path.join(homeDirectory, ".config"), "huly")
}

export const cliProfilePaths = (
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv,
  homeDirectory: string
): CliProfilePaths => {
  const directory = configBaseDirectory(platform, environment, homeDirectory)
  return {
    credentials: path.join(directory, "credentials.json"),
    directory,
    profiles: path.join(directory, "profiles.json")
  }
}

const parseFile = <A, I>(
  filePath: string,
  text: string,
  schema: Schema.Codec<A, I>
): Effect.Effect<A, CliProfileStoreError> =>
  Effect.try({
    try: (): unknown => JSON.parse(text),
    catch: () => new CliProfileStoreError({ kind: "input", message: `Malformed JSON in ${filePath}.` })
  }).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(schema)),
    Effect.mapError((error) =>
      error instanceof CliProfileStoreError
        ? error
        : new CliProfileStoreError({ kind: "input", message: `Invalid Huly CLI configuration in ${filePath}.` })
    )
  )

const readFile = <A, I>(
  filePath: string,
  schema: Schema.Codec<A, I>,
  whenMissing: () => A
): Effect.Effect<A, CliProfileStoreError> =>
  Effect.tryPromise({
    try: () => fs.readFile(filePath, "utf8"),
    catch: (error) => new CliFileReadError({ missing: isMissingFile(error) })
  }).pipe(
    Effect.flatMap((text) => parseFile(filePath, text, schema)),
    Effect.catch((error) =>
      error instanceof CliFileReadError && error.missing
        ? Effect.succeed(whenMissing())
        : error instanceof CliProfileStoreError
          ? Effect.fail(error)
          : Effect.fail(new CliProfileStoreError({ kind: "integration", message: `Cannot read ${filePath}.` }))
    )
  )

const writeFile = <A, I>(
  paths: CliProfilePaths,
  filePath: string,
  schema: Schema.Codec<A, I>,
  value: A
): Effect.Effect<void, CliProfileStoreError> =>
  Effect.gen(function* () {
    const writeError = () => new CliProfileStoreError({ kind: "integration", message: `Cannot write ${filePath}.` })
    const encoded = yield* Schema.encodeEffect(schema)(value).pipe(Effect.mapError(writeError))
    yield* Effect.tryPromise({
      try: async () => {
        await fs.mkdir(paths.directory, { recursive: true, mode: CONFIG_DIRECTORY_MODE })
        await fs.chmod(paths.directory, CONFIG_DIRECTORY_MODE)
      },
      catch: writeError
    })
    yield* Effect.acquireUseRelease(
      Effect.tryPromise({ try: () => fs.mkdtemp(path.join(paths.directory, ".huly-write-")), catch: writeError }),
      (temporaryDirectory) =>
        Effect.tryPromise({
          try: async () => {
            const temporaryFile = path.join(temporaryDirectory, path.basename(filePath))
            await fs.writeFile(temporaryFile, `${JSON.stringify(encoded, null, JSON_INDENT_SPACES)}\n`, {
              encoding: "utf8",
              flag: "wx",
              mode: CONFIG_FILE_MODE
            })
            await fs.rename(temporaryFile, filePath)
          },
          catch: writeError
        }),
      (temporaryDirectory) =>
        Effect.ignore(
          Effect.tryPromise({
            try: () => fs.rm(temporaryDirectory, { recursive: true, force: true }),
            catch: writeError
          })
        )
    )
  })

export interface CliProfileStore {
  readonly paths: CliProfilePaths
  readonly readCredentials: () => Effect.Effect<CliCredentialsFile, CliProfileStoreError>
  readonly readProfiles: () => Effect.Effect<CliProfilesFile, CliProfileStoreError>
  readonly writeCredentials: (credentials: CliCredentialsFile) => Effect.Effect<void, CliProfileStoreError>
  readonly writeProfiles: (profiles: CliProfilesFile) => Effect.Effect<void, CliProfileStoreError>
}

export const makeCliProfileStore = (paths: CliProfilePaths): CliProfileStore => ({
  paths,
  readCredentials: () => readFile(paths.credentials, CliCredentialsFileSchema, emptyCredentials),
  readProfiles: () => readFile(paths.profiles, CliProfilesFileSchema, emptyProfiles),
  writeCredentials: (credentials) => writeFile(paths, paths.credentials, CliCredentialsFileSchema, credentials),
  writeProfiles: (profiles) => writeFile(paths, paths.profiles, CliProfilesFileSchema, profiles)
})
