import { makeSharedResource } from "../runtime/shared-resource.js"
import { tracker } from "./huly-plugins.js"
import { makeOperationConnectionError } from "./errors-base.js"

import { makeClientOperations } from "./client-operations.js"

import { type Doc, type FindResult, toFindResult, type WithLookup } from "@hcengineering/core"
import { Context, Effect, Layer } from "effect"
import { HulyConfigService } from "../config/config.js"
import { SocialIdentityId } from "../domain/schemas/person-administration.js"

import { AccountUuid as ParsedAccountUuid } from "../domain/schemas/shared.js"

import { testMarkupUrlConfig } from "./operations/markup.js"

import { toAccountUuid, toCorePersonId } from "./operations/sdk-boundary.js"
import { HulySdk } from "./sdk-deps.js"

import { acquireClosableClient } from "./scoped-client.js"

import { testWorkbenchUrlConfig } from "./url-builders.js"

import { MovementTransportMilliseconds } from "./movement-transaction-transport.js"

import type { HulyClientOperations, HulyClientError } from "./client-ports.js"
import {
  connectRestTransport,
  connectRestWithRetry,
  connectionAttempt,
  withConnectionRetry
} from "./client-connection.js"
export type { HulyClientOperations, HulyClientError } from "./client-ports.js"
export { authToOptions, connectWithRetry } from "./client-connection.js"
export type { ConnectionConfig, ConnectionError } from "./client-connection.js"
export class HulyClient extends Context.Service<HulyClient, HulyClientOperations>()("@hulymcp/HulyClient") {
  static readonly layerWithDependencies: Layer.Layer<HulyClient, HulyClientError, HulyConfigService | HulySdk> =
    Layer.effect(
      HulyClient,
      Effect.gen(function* () {
        const config = yield* HulyConfigService
        const sdk = yield* HulySdk

        const {
          accountUuid,
          client,
          imageUrl,
          markupOps,
          movementTransportConfig,
          primarySocialId,
          refUrl,
          socialIds,
          workspaceUrlSlug
        } = yield* acquireClosableClient(
          connectRestWithRetry(
            { url: config.url, auth: config.auth, workspace: config.workspace },
            sdk,
            MovementTransportMilliseconds.make(config.connectionTimeout)
          )
        )

        return makeClientOperations(
          {
            accountUuid,
            client: Effect.succeed(client),
            imageUrl,
            markupOps,
            movementTransportConfig,
            primarySocialId,
            refUrl,
            socialIds,
            workspaceUrlSlug
          },
          sdk,
          config
        )
      })
    )

  private static makeLazyLayer(
    modelLoading: "background" | "on-demand"
  ): Layer.Layer<HulyClient, HulyClientError, HulyConfigService | HulySdk> {
    return Layer.effect(
      HulyClient,
      Effect.gen(function* () {
        const config = yield* HulyConfigService
        const sdk = yield* HulySdk
        const connectionConfig = { url: config.url, auth: config.auth, workspace: config.workspace }
        const timeout = MovementTransportMilliseconds.make(config.connectionTimeout)
        const transport = yield* connectRestTransport(connectionConfig, sdk, timeout).pipe(withConnectionRetry)
        const context = yield* connectionAttempt(async () => transport.complete(), config.url)
        let projectClient = transport.projectClient
        const fullConnection = yield* makeSharedResource(
          connectRestWithRetry(
            connectionConfig,
            sdk,
            timeout,
            transport,
            (selected) => {
              projectClient = selected.projectClient
            },
            "scope"
          )
        )
        const client = Effect.map(fullConnection, (connection) => connection.client)
        if (modelLoading === "background") yield* client.pipe(Effect.ignore, Effect.forkScoped)
        return makeClientOperations(
          {
            ...context,
            client,
            resolveFullConnection: fullConnection,
            findProjectDocuments: (query, options) =>
              Effect.tryPromise({
                try: () => projectClient.findAll(tracker.class.Project, query, options),
                catch: (error) => makeOperationConnectionError("findAll", error)
              })
          },
          sdk,
          config
        )
      })
    )
  }
  static readonly lazyLayerWithDependencies = HulyClient.makeLazyLayer("background")
  static readonly onDemandLayerWithDependencies = HulyClient.makeLazyLayer("on-demand")
  static readonly onDemandLayer = HulyClient.onDemandLayerWithDependencies.pipe(Layer.provide(HulySdk.defaultLayer))

  static readonly layer: Layer.Layer<HulyClient, HulyClientError, HulyConfigService> =
    HulyClient.lazyLayerWithDependencies.pipe(Layer.provide(HulySdk.defaultLayer))

  static testLayer(mockOperations: Partial<HulyClientOperations>): Layer.Layer<HulyClient> {
    const noopFindAll = <T extends Doc>(): Effect.Effect<FindResult<T>, HulyClientError> =>
      Effect.succeed(toFindResult<T>([]))

    const noopFindOne = <T extends Doc>(): Effect.Effect<WithLookup<T> | undefined, HulyClientError> =>
      Effect.succeed(undefined)

    const notImplemented = (name: string) => (): Effect.Effect<never, HulyClientError> =>
      Effect.die(new Error(`${name} not implemented in test layer`))

    const noopFetchMarkup = (): Effect.Effect<string, HulyClientError> => Effect.succeed("")

    const defaultOps: HulyClientOperations = {
      getAccountUuid: () => toAccountUuid(ParsedAccountUuid.make("00000000-0000-4000-8000-000000000000")),
      getPrimarySocialId: () => toCorePersonId(SocialIdentityId.make("test-primary-social-id")),
      getSocialIds: () => [toCorePersonId(SocialIdentityId.make("test-primary-social-id"))],
      markupUrlConfig: testMarkupUrlConfig,
      workbenchUrlConfig: testWorkbenchUrlConfig,
      findAll: noopFindAll,
      findAllInModel: noopFindAll,
      findOne: noopFindOne,
      createDoc: notImplemented("createDoc"),
      createDocIfNotMatched: notImplemented("createDocIfNotMatched"),
      updateDoc: notImplemented("updateDoc"),
      updateDocIfMatched: notImplemented("updateDocIfMatched"),
      addCollection: notImplemented("addCollection"),
      removeDoc: notImplemented("removeDoc"),
      removeDocIfMatched: notImplemented("removeDocIfMatched"),
      uploadMarkup: notImplemented("uploadMarkup"),
      fetchMarkup: noopFetchMarkup,
      createMixin: notImplemented("createMixin"),
      commitEmployeePreparation: notImplemented("commitEmployeePreparation"),
      updateMixin: notImplemented("updateMixin"),
      updateMarkup: notImplemented("updateMarkup"),
      searchFulltext: notImplemented("searchFulltext")
    }

    return Layer.succeed(HulyClient, { ...defaultOps, ...mockOperations })
  }
}
