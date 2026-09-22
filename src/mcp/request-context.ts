import { Context, type Effect } from "effect"

import type { SanitizedHulyRuntimeConfigContext } from "../config/config.js"
import type { ClientResolver } from "../runtime/client-resolver.js"

/**
 * Request-local Huly state supplied by the HTTP transport. Tool handlers read
 * this service from the current Effect fiber; no process-global mutable slot is
 * involved, so concurrent HTTP requests cannot cross-contaminate credentials.
 */
export interface McpRequestContext {
  readonly runtimeConfig: SanitizedHulyRuntimeConfigContext
  readonly resolveClients: ClientResolver
  readonly retainClients?: () => () => void
  readonly cancellation?: Effect.Effect<never>
}

export class McpRequestContextService extends Context.Service<McpRequestContextService, McpRequestContext>()(
  "@hulymcp/McpRequestContext"
) {}
