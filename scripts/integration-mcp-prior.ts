import { specTypeSchemas, type DiscoverResult, type ListToolsResult } from "@modelcontextprotocol/client"
import { Effect, Redacted, Schema, SchemaIssue } from "effect"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { lstat, readFile, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"

const PERMISSION_MODE_MASK = 0o777
const PRIVATE_DIRECTORY_MODE = 0o700
const PRIVATE_FILE_MODE = 0o600

// The SDK Standard Schema owns the MCP DTO. The Effect codec returns its parsed value,
// rather than validating and forwarding the unknown file payload.
export const NativeDiscoverySchema = Schema.declareConstructor<DiscoverResult>()([], () => (input) => {
  const parsed = specTypeSchemas.DiscoverResult["~standard"].validate(input)
  return parsed.issues === undefined
    ? Effect.succeed(parsed.value)
    : Effect.fail(new SchemaIssue.InvalidValue({ message: "Invalid native discovery" }))
})
export const NativeToolListSchema = Schema.declareConstructor<ListToolsResult>()([], () => (input) => {
  const parsed = specTypeSchemas.ListToolsResult["~standard"].validate(input)
  return parsed.issues === undefined
    ? Effect.succeed(parsed.value)
    : Effect.fail(new SchemaIssue.InvalidValue({ message: "Invalid native tool list" }))
})
const Digest = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))
const Commit = Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}$/))
export const PriorIdentitySchema = Schema.Struct({
  commit: Commit,
  artifact: Digest,
  invocation: Digest,
  context: Digest
})
export type PriorIdentity = Schema.Schema.Type<typeof PriorIdentitySchema>
export const PriorCacheSchema = Schema.Struct({ identity: PriorIdentitySchema, discover: NativeDiscoverySchema })
export type PriorCache = Schema.Schema.Type<typeof PriorCacheSchema>
export class IntegrationMcpPriorError extends Schema.TaggedError<IntegrationMcpPriorError>()(
  "IntegrationMcpPriorError",
  { phase: Schema.Literals(["identity", "permissions", "cache", "version"]) }
) {}
const Environment = Schema.Record(Schema.String, Schema.RedactedFromValue(Schema.String))
const digest = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex")
export const PRIOR_CACHE_ENV = "HULY_INTEGRATION_MCP_PRIOR"
// Internal process settings; environment values are parsed/redacted at the adapter boundary.
export interface PriorProcessOptions {
  readonly command: string
  readonly args: ReadonlyArray<string>
  readonly environment: NodeJS.ProcessEnv
}
export const normalizeIntegrationEnvironment = (input: NodeJS.ProcessEnv) =>
  Schema.decodeUnknownSync(Environment)(
    Object.fromEntries(
      Object.entries({
        ...input,
        HULY_TOOL_MODE: "native",
        LAZY_ENVS: "true",
        HULY_MCP_TELEMETRY: "0",
        HULY_CLI_TELEMETRY: "0"
      }).filter(([key, value]) => value !== undefined && key !== PRIOR_CACHE_ENV)
    )
  )
export const makePriorIdentity = (options: PriorProcessOptions) =>
  Effect.tryPromise({
    try: async () => {
      const entry = options.args[0]
      if (
        entry === undefined ||
        (options.environment["HULY_PROFILE"] ?? "") !== "" ||
        (options.environment["NODE_OPTIONS"] ?? "") !== ""
      )
        throw new Error("Unsupported prior identity")
      const environment = normalizeIntegrationEnvironment(options.environment)
      const context = Object.entries(environment)
        .filter(
          ([key]) => key.startsWith("HULY_") || key.startsWith("MCP_") || key === "NODE_OPTIONS" || key === "LAZY_ENVS"
        )
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => [key, Redacted.value(value)])
      const raw: unknown = {
        commit: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8",
          timeout: 10_000,
          killSignal: "SIGKILL"
        }).trim(),
        artifact: digest(await readFile(resolve(entry))),
        invocation: digest(JSON.stringify([options.command, ...options.args])),
        context: digest(JSON.stringify(context))
      }
      return Schema.decodeUnknownSync(PriorIdentitySchema)(raw)
    },
    catch: () => new IntegrationMcpPriorError({ phase: "identity" })
  })
const privatePath = (path: string) =>
  Effect.tryPromise({
    try: async () => {
      const directory = await lstat(dirname(path))
      const owner = process.getuid?.()
      if (
        owner === undefined ||
        !directory.isDirectory() ||
        directory.uid !== owner ||
        (directory.mode & PERMISSION_MODE_MASK) !== PRIVATE_DIRECTORY_MODE
      )
        throw new Error("Invalid prior directory")
    },
    catch: () => new IntegrationMcpPriorError({ phase: "permissions" })
  })
export const writePriorCache = (
  directory: string,
  identity: PriorIdentity,
  discover: Schema.Schema.Type<typeof NativeDiscoverySchema>
) =>
  Effect.gen(function* () {
    const path = join(resolve(directory), "native-discovery.json")
    yield* privatePath(path)
    yield* Effect.tryPromise({
      try: async () => {
        await writeFile(path, Schema.encodeSync(Schema.fromJsonString(PriorCacheSchema))({ identity, discover }), {
          mode: PRIVATE_FILE_MODE,
          flag: "wx"
        })
      },
      catch: () => new IntegrationMcpPriorError({ phase: "cache" })
    })
    return path
  })
export const readPriorCache = (path: string, identity: PriorIdentity) =>
  Effect.gen(function* () {
    yield* privatePath(path)
    const cache = yield* Effect.tryPromise({
      try: async () => {
        const file = await lstat(path)
        if (
          !file.isFile() ||
          file.uid !== process.getuid?.() ||
          (file.mode & PERMISSION_MODE_MASK) !== PRIVATE_FILE_MODE
        )
          throw new Error("Invalid prior file")
        const raw: unknown = await readFile(path, "utf8")
        return Schema.decodeUnknownSync(Schema.fromJsonString(PriorCacheSchema))(raw)
      },
      catch: () => new IntegrationMcpPriorError({ phase: "cache" })
    })
    if (JSON.stringify(cache.identity) !== JSON.stringify(identity))
      return yield* Effect.fail(new IntegrationMcpPriorError({ phase: "identity" }))
    if (!cache.discover.supportedVersions.includes("2026-07-28"))
      return yield* Effect.fail(new IntegrationMcpPriorError({ phase: "version" }))
    return cache.discover
  })
