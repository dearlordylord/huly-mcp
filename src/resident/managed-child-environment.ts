import { Effect, Redacted, Schema } from "effect"

import { ProfileEnvironmentSchema } from "../profiles/model.js"
import { type BootstrapNonce, ManagedLaunchError } from "./managed-contract.js"

const InheritedEnvironment = Schema.Record(Schema.String, Schema.UndefinedOr(Schema.RedactedFromValue(Schema.String)))
export const ManagedChildEnvironment = Schema.Record(Schema.String, Schema.RedactedFromValue(Schema.String))
export type ManagedChildEnvironment = Schema.Schema.Type<typeof ManagedChildEnvironment>

const BOOTSTRAP_NONCE = "MCP_RESIDENT_BOOTSTRAP_NONCE"
const TRANSPORT = "MCP_TRANSPORT"
const replacedKeys = [...Object.keys(ProfileEnvironmentSchema.fields), "MCP_AUTH_TOKEN", BOOTSTRAP_NONCE, TRANSPORT]

export const parseManagedChildEnvironment = Effect.fn("parseManagedChildEnvironment")(function* (
  input: unknown,
  platform: NodeJS.Platform,
  nonce: BootstrapNonce
) {
  const inherited = yield* Schema.decodeUnknownEffect(InheritedEnvironment)(input).pipe(
    Effect.mapError(
      () =>
        new ManagedLaunchError({
          reason: "ipc",
          message: "Resident child environment is invalid; no backend was started"
        })
    )
  )
  const normalize = (key: string) => (platform === "win32" ? key.toUpperCase() : key)
  const replaced = new Set(replacedKeys.map(normalize))
  const preserved = Object.fromEntries(
    Object.entries(inherited).flatMap(([key, value]) =>
      value !== undefined && !replaced.has(normalize(key))
        ? [[key, value] satisfies readonly [string, Redacted.Redacted<string>]]
        : []
    )
  )
  const environment: ManagedChildEnvironment = {
    ...preserved,
    [TRANSPORT]: Redacted.make("resident-child"),
    [BOOTSTRAP_NONCE]: nonce
  }
  return environment
})
