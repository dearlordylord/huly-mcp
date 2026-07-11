/** Safe, agent-facing diagnostics for an unavailable Huly endpoint. */
const DEFAULT_HULY_CLOUD_ORIGIN = "https://huly.app"

export const HOSTED_HULY_SUNSET = {
  sourceUrl: "https://github.com/hcengineering/huly",
  expectedShutdown: "July 20"
} as const

type HulyEndpointKind = "default_cloud" | "custom"
type HulyUnavailableFailureKind = "refused" | "timeout" | "dns" | "tls" | "http_unavailable" | "unknown"

export const normalizeHulyOrigin = (url: string): string => {
  const parsed = new URL(url)
  return parsed.origin.toLowerCase()
}

export const classifyEndpointKind = (origin: string): HulyEndpointKind =>
  origin === DEFAULT_HULY_CLOUD_ORIGIN ? "default_cloud" : "custom"

const errorCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : ""

const classifiedCodes: Readonly<Record<string, readonly [HulyUnavailableFailureKind, string]>> = {
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
): readonly [HulyUnavailableFailureKind, string | undefined] => {
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
