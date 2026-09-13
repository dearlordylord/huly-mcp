import { Schema } from "effect"

export const HulyEndpointOriginSchema = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter(
      (value) => {
        try {
          const parsed = new URL(value)
          return (parsed.protocol === "http:" || parsed.protocol === "https:") && parsed.origin.toLowerCase() === value
        } catch {
          return false
        }
      },
      { message: "Must be a canonical http or https URL origin" }
    )
  ),
  Schema.brand("HulyEndpointOrigin")
)
type HulyEndpointOrigin = Schema.Schema.Type<typeof HulyEndpointOriginSchema>

export const HulyUnavailableFailureKindSchema = Schema.Literals([
  "refused",
  "timeout",
  "dns",
  "tls",
  "http_unavailable",
  "unknown"
])
type HulyUnavailableFailureKind = Schema.Schema.Type<typeof HulyUnavailableFailureKindSchema>

export const HulyUnavailableDetailCodeSchema = Schema.Literals([
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE"
])
type HulyUnavailableDetailCode = Schema.Schema.Type<typeof HulyUnavailableDetailCodeSchema>

export const normalizeHulyOrigin = (url: string): HulyEndpointOrigin => {
  const parsed = new URL(url)
  return Schema.decodeUnknownSync(HulyEndpointOriginSchema)(parsed.origin.toLowerCase())
}

const errorCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : "")

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

const messageIncludesAny = (message: string, fragments: ReadonlyArray<string>): boolean =>
  fragments.some((fragment) => message.includes(fragment))

const classifyUnavailableMessage = (
  message: string
): readonly [HulyUnavailableFailureKind, HulyUnavailableDetailCode | undefined] => {
  if (messageIncludesAny(message, ["timed out", "timeout"])) return ["timeout", undefined]
  if (messageIncludesAny(message, ["certificate", "tls"])) return ["tls", undefined]
  if (messageIncludesAny(message, ["dns", "getaddrinfo"])) return ["dns", undefined]
  if (/\b(502|503|504)\b/.test(message) || message.includes("service unavailable")) {
    return ["http_unavailable", undefined]
  }
  return ["unknown", undefined]
}

export const classifyHulyUnavailableFailure = (
  error: unknown
): readonly [HulyUnavailableFailureKind, HulyUnavailableDetailCode | undefined] => {
  const code = errorCode(error)
  if (code !== undefined) {
    const classified = classifiedCodes[code]
    if (classified !== undefined) return classified
  }
  return classifyUnavailableMessage(errorMessage(error).toLowerCase())
}
