import { ConfigProvider, Effect, Layer } from "effect"

import { HulyConfigService } from "../config/config.js"
import { HulyClient } from "../huly/client.js"
import { tracker } from "../huly/huly-plugins.js"
import { hulyQuery } from "../huly/operations/query-helpers.js"
import { resolvedConfigProvider } from "./config-provider.js"
import { CliProfileStoreError, type ResolvedCliConfiguration } from "./model.js"

export const checkHulyConnection = Effect.fn("Profiles.checkConnection")(function* (
  configuration: ResolvedCliConfiguration
) {
  yield* Effect.gen(function* () {
    const client = yield* HulyClient
    yield* client.findAll(tracker.class.Project, hulyQuery({}), { limit: 1 })
  }).pipe(
    Effect.provide(HulyClient.layer.pipe(Layer.provide(HulyConfigService.layer))),
    Effect.provideService(ConfigProvider.ConfigProvider, resolvedConfigProvider(configuration)),
    Effect.timeout("10 seconds"),
    Effect.mapError(
      (error) =>
        new CliProfileStoreError({
          kind: "integration",
          message: `Huly connection check failed (${error._tag}). Check the destination, credentials, and connectivity.`
        })
    )
  )
})
