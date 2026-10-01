import { Schema } from "effect"

import { toDraft07JsonSchema } from "./json-schema.js"
import { Count } from "./shared.js"

const NonEmptyTrimmedString = Schema.Trimmed.pipe(Schema.check(Schema.isNonEmpty())).annotate({
  identifier: "NonEmptyTrimmedString",
  title: "NonEmptyTrimmedString",
  description: "A non-empty string with no leading or trailing whitespace."
})

const SanitizedUrlSchema = Schema.Struct({
  configured: Schema.Boolean,
  valid: Schema.optional(Schema.Boolean),
  origin: Schema.optional(
    NonEmptyTrimmedString.pipe(
      Schema.check(
        Schema.makeFilter(
          (value) => {
            try {
              const url = new URL(value)
              return (url.protocol === "http:" || url.protocol === "https:") && url.href === url.origin + "/"
            } catch {
              return false
            }
          },
          { message: "Must be a sanitized http or https URL origin" }
        )
      )
    )
  ),
  host: Schema.optional(NonEmptyTrimmedString),
  protocol: Schema.optional(Schema.Literals(["http:", "https:"]))
})

const WorkspaceContextSchema = Schema.Struct({
  configured: Schema.Boolean,
  value: Schema.optional(NonEmptyTrimmedString)
})

const ConnectionTimeoutContextSchema = Schema.Struct({
  configured: Schema.Boolean,
  valid: Schema.optional(Schema.Boolean),
  valueMs: Schema.optional(Schema.Number.pipe(Schema.check(Schema.isInt()), Schema.check(Schema.isGreaterThan(0)))),
  defaultMs: Schema.Number.pipe(Schema.check(Schema.isInt()), Schema.check(Schema.isGreaterThan(0))),
  source: Schema.Literals(["env", "header", "default", "missing", "invalid"])
})

const HulyRuntimeContextSchema = Schema.Struct({
  url: SanitizedUrlSchema,
  workspace: WorkspaceContextSchema,
  connectionTimeout: ConnectionTimeoutContextSchema
})

const AuthContextSchema = Schema.Struct({
  method: Schema.Literals(["token", "password", "unknown"]),
  source: Schema.Literals(["env", "header", "profile", "none"]),
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
  builtinTools: Schema.Array(Schema.Literals(["get_version", "get_huly_context"]))
})

const ToolScopeContextSchema = Schema.Struct({
  active: Schema.Boolean,
  requestedToolsets: Schema.Array(NonEmptyTrimmedString),
  enabledToolsets: Schema.Array(NonEmptyTrimmedString),
  ignoredToolsets: Schema.Array(NonEmptyTrimmedString),
  requestedTools: Schema.Array(NonEmptyTrimmedString),
  enabledTools: Schema.Array(NonEmptyTrimmedString),
  ignoredTools: Schema.Array(NonEmptyTrimmedString),
  availableCategories: Schema.Array(NonEmptyTrimmedString),
  visibleRegisteredToolCount: Count,
  totalRegisteredToolCount: Count,
  builtinTools: Schema.Array(Schema.Literals(["get_version", "get_huly_context"]))
})

const ToolExposureContextSchema = Schema.Struct({
  configuredMode: Schema.Literals(["auto", "native", "proxy"]),
  resolvedMode: Schema.Literals(["native", "proxy"]),
  clientKind: Schema.Literals([
    "claude-code",
    "claude-ai",
    "cursor",
    "windsurf",
    "github-copilot",
    "codex",
    "opencode",
    "unknown"
  ]),
  proxyOutputStrict: Schema.Boolean,
  visibleToolCount: Count,
  nativeVisibleToolCount: Count,
  proxyCandidateToolCount: Count,
  proxyToolNames: Schema.Array(NonEmptyTrimmedString)
})

export const GetHulyContextResultSchema = Schema.Struct({
  package: Schema.Struct({ name: Schema.Literal("@firfi/huly-mcp"), version: NonEmptyTrimmedString }),
  transport: Schema.Struct({
    type: Schema.Literals(["stdio", "http"]),
    http: Schema.optional(
      Schema.Struct({
        host: NonEmptyTrimmedString,
        port: Schema.Number.pipe(Schema.check(Schema.isInt()), Schema.check(Schema.isGreaterThan(0)))
      })
    )
  }),
  huly: HulyRuntimeContextSchema,
  auth: AuthContextSchema,
  configSources: ConfigSourcesSchema,
  toolsets: ToolsetsContextSchema,
  toolScope: ToolScopeContextSchema,
  toolExposure: ToolExposureContextSchema
})

export type GetHulyContextResult = Schema.Schema.Type<typeof GetHulyContextResultSchema>

export const getHulyContextResultJsonSchema = toDraft07JsonSchema(GetHulyContextResultSchema)
