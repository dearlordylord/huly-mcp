import { JSONSchema, Schema } from "effect"

import { Count } from "./shared.js"

const NonEmptyTrimmedString = Schema.NonEmptyTrimmedString

const SanitizedUrlSchema = Schema.Struct({
  configured: Schema.Boolean,
  valid: Schema.optional(Schema.Boolean),
  origin: Schema.optional(NonEmptyTrimmedString.pipe(
    Schema.filter((value) => {
      try {
        const url = new URL(value)
        return (url.protocol === "http:" || url.protocol === "https:") && url.href === url.origin + "/"
      } catch {
        return false
      }
    }, { message: () => "Must be a sanitized http or https URL origin" })
  )),
  host: Schema.optional(NonEmptyTrimmedString),
  protocol: Schema.optional(Schema.Literal("http:", "https:"))
})

const WorkspaceContextSchema = Schema.Struct({
  configured: Schema.Boolean,
  value: Schema.optional(NonEmptyTrimmedString)
})

const ConnectionTimeoutContextSchema = Schema.Struct({
  configured: Schema.Boolean,
  valid: Schema.optional(Schema.Boolean),
  valueMs: Schema.optional(Schema.Number.pipe(Schema.int(), Schema.positive())),
  defaultMs: Schema.Number.pipe(Schema.int(), Schema.positive()),
  source: Schema.Literal("env", "header", "default", "missing", "invalid")
})

const HulyRuntimeContextSchema = Schema.Struct({
  url: SanitizedUrlSchema,
  workspace: WorkspaceContextSchema,
  connectionTimeout: ConnectionTimeoutContextSchema
})

const AuthContextSchema = Schema.Struct({
  method: Schema.Literal("token", "password", "unknown"),
  source: Schema.Literal("env", "header", "none"),
  tokenConfigured: Schema.Boolean,
  emailConfigured: Schema.Boolean,
  passwordConfigured: Schema.Boolean
})

const EnvConfigSourcesSchema = Schema.Struct({
  hulyUrl: Schema.Boolean,
  hulyWorkspace: Schema.Boolean,
  hulyToken: Schema.Boolean,
  hulyEmail: Schema.Boolean,
  hulyPassword: Schema.Boolean,
  hulyConnectionTimeout: Schema.Boolean,
  lazyEnvs: Schema.Boolean
})

const HeaderConfigSourcesSchema = Schema.Struct({
  present: Schema.Boolean,
  requiredComplete: Schema.Boolean,
  hulyUrl: Schema.Boolean,
  hulyWorkspace: Schema.Boolean,
  hulyToken: Schema.Boolean,
  hulyConnectionTimeout: Schema.Boolean,
  unsupportedHulyHeaders: Schema.Array(NonEmptyTrimmedString)
})

const ConfigSourcesSchema = Schema.Struct({
  env: EnvConfigSourcesSchema,
  headers: Schema.optional(HeaderConfigSourcesSchema)
})

const ToolsetsContextSchema = Schema.Struct({
  filteringActive: Schema.Boolean,
  requestedCategories: Schema.Array(NonEmptyTrimmedString),
  enabledCategories: Schema.Array(NonEmptyTrimmedString),
  ignoredCategories: Schema.Array(NonEmptyTrimmedString),
  availableCategories: Schema.Array(NonEmptyTrimmedString),
  visibleRegisteredToolCount: Count,
  totalRegisteredToolCount: Count,
  builtinTools: Schema.Array(Schema.Literal("get_version", "get_huly_context"))
})

export const GetHulyContextResultSchema = Schema.Struct({
  package: Schema.Struct({
    name: Schema.Literal("@firfi/huly-mcp"),
    version: NonEmptyTrimmedString
  }),
  transport: Schema.Struct({
    type: Schema.Literal("stdio", "http"),
    http: Schema.optional(Schema.Struct({
      host: NonEmptyTrimmedString,
      port: Schema.Number.pipe(Schema.int(), Schema.positive())
    }))
  }),
  huly: HulyRuntimeContextSchema,
  auth: AuthContextSchema,
  configSources: ConfigSourcesSchema,
  toolsets: ToolsetsContextSchema
})

export type GetHulyContextResult = Schema.Schema.Type<typeof GetHulyContextResultSchema>

export const getHulyContextResultJsonSchema = JSONSchema.make(GetHulyContextResultSchema)
