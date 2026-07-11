import { Schema } from "effect"

/** Safe, agent-facing diagnostics for an unavailable Huly endpoint. */
const DEFAULT_HULY_CLOUD_ORIGIN = "https://huly.app"

export const HOSTED_HULY_SUNSET = {
  sourceUrl: "https://github.com/hcengineering/huly",
  expectedShutdown: "July 20"
} as const

export const HulyEndpointOriginSchema = Schema.String.pipe(
  Schema.filter((value) => {
    try {
      const parsed = new URL(value)
      return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.origin.toLowerCase() === value
    } catch {
      return false
    }
  }, { message: () => "Must be a canonical http or https URL origin" }),
  Schema.brand("HulyEndpointOrigin")
)
type HulyEndpointOrigin = Schema.Schema.Type<typeof HulyEndpointOriginSchema>

export const HulyUnavailableFailureKindSchema = Schema.Literal(
  "refused",
  "timeout",
  "dns",
  "tls",
  "http_unavailable",
  "unknown"
)
type HulyUnavailableFailureKind = Schema.Schema.Type<typeof HulyUnavailableFailureKindSchema>

export const HulyUnavailableDetailCodeSchema = Schema.Literal(
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
)
type HulyUnavailableDetailCode = Schema.Schema.Type<typeof HulyUnavailableDetailCodeSchema>

export const normalizeHulyOrigin = (url: string): HulyEndpointOrigin => {
  const parsed = new URL(url)
  return Schema.decodeUnknownSync(HulyEndpointOriginSchema)(parsed.origin.toLowerCase())
}

export const isDefaultHulyCloudOrigin = (origin: HulyEndpointOrigin): boolean => origin === DEFAULT_HULY_CLOUD_ORIGIN

const errorCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : ""

const classifiedCodes: Readonly<
  Record<string, readonly [HulyUnavailableFailureKind, Schema.Schema.Type<typeof HulyUnavailableDetailCodeSchema>]>
> = {
  ECONNREFUSED: ["refused", "ECONNREFUSED"],
  ETIMEDOUT: ["timeout", "ETIMEDOUT"],
  ECONNRESET: ["timeout", "ECONNRESET"],
  ENOTFOUND: ["dns", "ENOTFOUND"],
  EAI_AGAIN: ["dns", "EAI_AGAIN"],
  CERT_HAS_EXPIRED: ["tls", "CERT_HAS_EXPIRED"],
  DEPTH_ZERO_SELF_SIGNED_CERT: ["tls", "DEPTH_ZERO_SELF_SIGNED_CERT"],
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: ["tls", "UNABLE_TO_VERIFY_LEAF_SIGNATURE"]
}

export const classifyHulyUnavailableFailure = (
  error: unknown
): readonly [HulyUnavailableFailureKind, HulyUnavailableDetailCode | undefined] => {
  const code = errorCode(error)
  if (code !== undefined) {
    const classified = classifiedCodes[code]
    if (classified !== undefined) return classified
  }
  const message = errorMessage(error).toLowerCase()
  if (message.includes("timed out") || message.includes("timeout")) return ["timeout", undefined]
  if (message.includes("certificate") || message.includes("tls")) return ["tls", undefined]
  if (message.includes("dns") || message.includes("getaddrinfo")) return ["dns", undefined]
  if (/\b(502|503|504)\b/.test(message) || message.includes("service unavailable")) {
    return ["http_unavailable", undefined]
  }
  return ["unknown", undefined]
}
