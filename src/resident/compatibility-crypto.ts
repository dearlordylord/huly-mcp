import { createHmac, timingSafeEqual } from "node:crypto"
import { Effect, Redacted, Schema } from "effect"

import { HulyConfigSchema } from "../config/config.js"
import { McpProcessPolicy } from "../mcp/process-policy.js"
import {
  type CompatibilityChallenge,
  CompatibilityError,
  CompatibilityMac,
  type CompatibilityProof,
  type ResidentSelection
} from "./compatibility-contract.js"

const ARRAY_CLOSING_BRACKET_OFFSET = -1
const [TokenAuth, PasswordAuth] = HulyConfigSchema.fields.auth.members
const CanonicalAuth = Schema.Union([
  Schema.Tuple([TokenAuth.fields._tag, TokenAuth.fields.token]),
  Schema.Tuple([PasswordAuth.fields._tag, PasswordAuth.fields.email, PasswordAuth.fields.password])
])
const CanonicalSelection = Schema.Tuple([
  HulyConfigSchema.fields.url,
  HulyConfigSchema.fields.workspace,
  CanonicalAuth,
  HulyConfigSchema.fields.connectionTimeout,
  McpProcessPolicy.fields.toolsets,
  McpProcessPolicy.fields.tools,
  McpProcessPolicy.fields.exposure.fields.configuredMode,
  McpProcessPolicy.fields.exposure.fields.proxyOutputStrict,
  Schema.Boolean
])

export const encodeCompatibilitySelection = (selection: ResidentSelection) => {
  const { huly, lazyEnvs, policy } = selection
  const auth: Schema.Schema.Type<typeof CanonicalAuth> =
    huly.auth._tag === "token" ? ["token", huly.auth.token] : ["password", huly.auth.email, huly.auth.password]
  return Schema.encodeEffect(Schema.fromJsonString(CanonicalSelection))([
    huly.url,
    huly.workspace,
    auth,
    huly.connectionTimeout,
    policy.toolsets,
    policy.tools,
    policy.exposure.configuredMode,
    policy.exposure.proxyOutputStrict,
    lazyEnvs
  ]).pipe(
    Effect.map(Redacted.make),
    Effect.mapError(
      () => new CompatibilityError({ kind: "encoding", message: "Resident selection could not be encoded" })
    )
  )
}

export const deriveCompatibilityKey = (authorization: Redacted.Redacted<string>) =>
  createHmac("sha256", Redacted.value(authorization))
    .update("@firfi/huly-mcp/resident-compatibility-key/v1", "utf8")
    .digest()

export const computeCompatibilityMac = (
  encoded: Redacted.Redacted<string>,
  challenge: CompatibilityChallenge,
  key: Buffer
): CompatibilityMac => {
  const transcript = JSON.stringify([
    "@firfi/huly-mcp/resident-compatibility/v1",
    challenge.version,
    challenge.implementation,
    challenge.generation,
    "compare",
    Redacted.value(challenge.nonce)
  ])
  const mac = createHmac("sha256", key)
    .update(`${transcript.slice(0, ARRAY_CLOSING_BRACKET_OFFSET)},${Redacted.value(encoded)}]`, "utf8")
    .digest("hex")
  return Schema.decodeUnknownSync(CompatibilityMac)(mac)
}

export const compatibilityMacMatches = (expected: CompatibilityMac, actual: CompatibilityMac): boolean =>
  timingSafeEqual(Buffer.from(Redacted.value(expected), "hex"), Buffer.from(Redacted.value(actual), "hex"))

export const makeCompatibilityProof = (
  selection: ResidentSelection,
  challenge: CompatibilityChallenge,
  authorization: Redacted.Redacted<string>
): Effect.Effect<CompatibilityProof, CompatibilityError> =>
  encodeCompatibilitySelection(selection).pipe(
    Effect.map((encoded) => {
      const key = deriveCompatibilityKey(authorization)
      try {
        return { ...challenge, mac: computeCompatibilityMac(encoded, challenge, key) }
      } finally {
        key.fill(0)
      }
    })
  )
