export const DEFAULT_HULY_CONNECTION_TIMEOUT = 30000

// Required only when a request provides any x-huly-* header; otherwise HTTP falls back to process env config.
export const REQUIRED_HULY_CONFIG_HEADERS = ["x-huly-url", "x-huly-workspace", "x-huly-token"] as const

export const HULY_CONFIG_HEADERS = [
  ...REQUIRED_HULY_CONFIG_HEADERS,
  "x-huly-connection-timeout"
] as const
