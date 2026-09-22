import { Context, Effect, Option } from "effect"

import type { SanitizedHulyRuntimeConfigContext } from "../config/config.js"
import type { ClientResolver } from "../runtime/client-resolver.js"
import { McpRequestContextService } from "./request-context.js"

/**
 * Select the resolver attached to the current request fiber when a transport
 * supplied one; stdio and direct tests use the registry fallback.
 */
export const requestScopedResolver = (fallback: ClientResolver): Effect.Effect<ClientResolver> =>
  Effect.contextWith((services: Context.Context<never>) => {
    const requestContext = Context.getOption(services, McpRequestContextService)
    return Effect.succeed(Option.isSome(requestContext) ? requestContext.value.resolveClients : fallback)
  })

/** Keep an HTTP request-owned client lease alive for the complete handler effect. */
export const withRequestScopedResolver = <A, E, R>(
  fallback: ClientResolver,
  use: (resolver: ClientResolver) => Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> =>
  Effect.contextWith((services: Context.Context<never>) => {
    const requestContext = Context.getOption(services, McpRequestContextService)
    if (Option.isNone(requestContext)) return use(fallback)
    const retain = requestContext.value.retainClients
    const handled =
      retain === undefined
        ? use(requestContext.value.resolveClients)
        : Effect.acquireUseRelease(
            Effect.sync(retain),
            () => use(requestContext.value.resolveClients),
            (release) => Effect.sync(release)
          )
    const cancellation = requestContext.value.cancellation
    return cancellation === undefined ? handled : Effect.raceFirst(handled, cancellation)
  })

export const requestScopedRuntimeConfig = (
  fallback: SanitizedHulyRuntimeConfigContext
): Effect.Effect<SanitizedHulyRuntimeConfigContext> =>
  Effect.contextWith((services: Context.Context<never>) => {
    const requestContext = Context.getOption(services, McpRequestContextService)
    return Effect.succeed(Option.isSome(requestContext) ? requestContext.value.runtimeConfig : fallback)
  })
