/** Request-local configuration, Huly lease, and client-disconnect ownership for MCP HTTP. */
import { Deferred, Effect, type Exit } from "effect"
import type * as HttpMiddlewareModule from "effect/unstable/http/HttpMiddleware"
import * as HttpServerRequest from "effect/unstable/http/HttpServerRequest"

import { type SanitizedHulyRuntimeConfigContext, sanitizeHulyRuntimeConfigFromEnv } from "../config/config.js"
import type { ClientBundle, ClientResolver, HulyClientBundleError } from "../runtime/client-resolver.js"
import { createRequestClientLifecycle, type RequestClientLease } from "./request-client-lifecycle.js"
import { McpRequestContextService } from "./request-context.js"

export interface HttpRequestContextOptions {
  readonly resolveClients: ClientResolver
  readonly resolveClientLeaseForHttpRequest?: (
    request: Request,
    signal: AbortSignal
  ) => Promise<RequestClientLease<Exit.Exit<ClientBundle, HulyClientBundleError>>>
  readonly getRuntimeConfigContext?: () => SanitizedHulyRuntimeConfigContext
  readonly getRuntimeConfigContextForHttpRequest?: (request: Request) => SanitizedHulyRuntimeConfigContext
}

const toWebRequest = (request: HttpServerRequest.HttpServerRequest): Request => {
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) headers.set(name, value)
  const url = /^[a-z][a-z\d+.-]*:/iu.test(request.url) ? request.url : `http://localhost${request.url}`
  return new Request(url, { method: request.method, headers })
}

interface AbortEventSource {
  readonly once: (event: string, listener: () => void) => unknown
  readonly removeListener: (event: string, listener: () => void) => unknown
}

const isAbortEventSource = (source: object): source is AbortEventSource =>
  "once" in source &&
  typeof source.once === "function" &&
  "removeListener" in source &&
  typeof source.removeListener === "function"

const socketFromRequestSource = (source: AbortEventSource): AbortEventSource | undefined => {
  if (!("socket" in source) || typeof source.socket !== "object" || source.socket === null) return undefined
  return isAbortEventSource(source.socket) ? source.socket : undefined
}

const responseFromRequest = (request: object): AbortEventSource | undefined => {
  if (
    !("resolvedResponse" in request) ||
    typeof request.resolvedResponse !== "object" ||
    request.resolvedResponse === null
  ) {
    return undefined
  }
  return isAbortEventSource(request.resolvedResponse) ? request.resolvedResponse : undefined
}

const interruptWhenRequestAborts = <A, E, R>(
  request: HttpServerRequest.HttpServerRequest,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> => {
  const source = request.source
  if (!isAbortEventSource(source)) return effect
  const socket = socketFromRequestSource(source)
  const response = responseFromRequest(request)
  const interrupted = Effect.callback<never>((resume) => {
    const onAborted = () => resume(Effect.interrupt)
    source.once("aborted", onAborted)
    socket?.once("close", onAborted)
    response?.once("close", onAborted)
    return Effect.sync(() => {
      source.removeListener("aborted", onAborted)
      socket?.removeListener("close", onAborted)
      response?.removeListener("close", onAborted)
    })
  })
  return Effect.raceFirst(effect, interrupted)
}

export const requestContextMiddleware =
  (options: HttpRequestContextOptions): HttpMiddlewareModule.HttpMiddleware =>
  (httpEffect) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest
      const webRequest = toWebRequest(request)
      const runtimeConfig =
        options.getRuntimeConfigContextForHttpRequest?.(webRequest) ??
        options.getRuntimeConfigContext?.() ??
        sanitizeHulyRuntimeConfigFromEnv(process.env)
      const resolveLease =
        options.resolveClientLeaseForHttpRequest ??
        ((_request: Request, _signal: AbortSignal) =>
          options.resolveClients().then((bundle) => ({ bundle, close: () => {} })))
      const lifecycle = createRequestClientLifecycle((signal) => resolveLease(webRequest, signal))
      const cancellation = yield* Deferred.make<void>()
      const context = McpRequestContextService.of({
        runtimeConfig,
        resolveClients: lifecycle.resolve,
        retainClients: lifecycle.retain,
        cancellation: Deferred.await(cancellation).pipe(Effect.andThen(Effect.interrupt))
      })
      return yield* Effect.acquireUseRelease(
        Effect.succeed(context),
        (requestContext) =>
          interruptWhenRequestAborts(
            request,
            Effect.provideService(httpEffect, McpRequestContextService, requestContext)
          ).pipe(Effect.onInterrupt(() => Deferred.succeed(cancellation, undefined))),
        () => Effect.promise(lifecycle.close).pipe(Effect.ignore)
      )
    })
