import { ConfigProvider, Effect, Exit } from "effect"

import { observeHttpAdmission } from "../mcp/http-admission-observations.js"
import { hulyConfigProviderFromHeaders } from "../config/config.js"
import type { RequestClientLease } from "../mcp/request-client-lifecycle.js"
import { buildScopedClientBundle, type CombinedClientLayer } from "./huly-clients.js"
import type { ClientBundle, ClientResolver, HulyClientBundleError } from "./client-resolver.js"

const webHeadersRecord = (headers: Headers): Record<string, string> => Object.fromEntries(headers.entries())

export const createHttpClientLeaseResolver =
  (
    combinedClientLayer: CombinedClientLayer,
    resolveEnvClients: ClientResolver
  ): ((request: Request) => Promise<RequestClientLease<Exit.Exit<ClientBundle, HulyClientBundleError>>>) =>
  async (request) => {
    const providerExit = await Effect.runPromiseExit(hulyConfigProviderFromHeaders(webHeadersRecord(request.headers)))
    if (Exit.isFailure(providerExit)) {
      observeHttpAdmission("createHttpClientLeaseResolver", { headers: "InvalidHulyHeaders", succeeded: false })
      return { bundle: Exit.failCause(providerExit.cause), close: () => {} }
    }

    const configProvider = providerExit.value
    if (configProvider === undefined) {
      return resolveEnvClients().then((bundle) => {
        observeHttpAdmission("createHttpClientLeaseResolver", {
          headers: "NoHulyHeaders",
          succeeded: Exit.isSuccess(bundle)
        })
        return { bundle, close: () => {} }
      })
    }

    const clientExit = await Effect.runPromiseExit(
      buildScopedClientBundle(combinedClientLayer).pipe(
        Effect.provideService(ConfigProvider.ConfigProvider, configProvider),
        Effect.map(({ bundle, close }) => ({ bundle: Exit.succeed(bundle), close }))
      )
    )
    observeHttpAdmission(
      "createHttpClientLeaseResolver",
      Exit.isSuccess(clientExit)
        ? { headers: "ValidHulyHeaders", buildOk: true, succeeded: true }
        : { headers: "ValidHulyHeaders", buildOk: false, succeeded: false }
    )
    return Exit.isSuccess(clientExit) ? clientExit.value : { bundle: Exit.failCause(clientExit.cause), close: () => {} }
  }
