import {
  type AttachedData,
  type AttachedDoc,
  type Class,
  type Data,
  type Doc,
  type DocumentQuery,
  type DocumentUpdate,
  type FindOptions,
  type FindResult,
  type Mixin,
  type MixinData,
  type MixinUpdate,
  type Ref,
  type Space,
  type TxOperations
} from "@hcengineering/core"
import { Effect } from "effect"

import { type HulyTransactionScope, UrlString } from "../domain/schemas/shared.js"

import { type HulyConnectionOperation, makeOperationConnectionError } from "./errors-base.js"

import { executeEmployeePreparation } from "./employee-preparation.js"

import { type MarkupUrlConfig } from "./operations/markup.js"

import { resolvePersonAdministrationTarget } from "./operations/person-administration-shared.js"
import { toRef } from "./operations/sdk-boundary.js"
import { type HulySdkDependencies } from "./sdk-deps.js"

import { type WorkbenchUrlConfig } from "./url-builders.js"
import { inspectNativePersonReferences, migrateNativePersonReferences } from "./person-reference-migration.js"
import { inspectTransferForest } from "./issue-transfer-forest.js"
import { commitTransfer, inspectTransferRecords } from "./issue-transfer-adapter.js"
import { inspectMovementTransactions } from "./issue-movement-transaction-inspection.js"
import { commitTransferTree } from "./issue-transfer-tree-adapter.js"

import { core, tracker } from "./huly-plugins.js"

import { withMovementWriteClient } from "./movement-write-client.js"

import type { HulyClientError, HulyClientOperations } from "./client-ports.js"
import type { RestConnection } from "./client-connection.js"
import type { Project as HulyProject } from "@hcengineering/tracker"

// Internal adapter input; SDK data is parsed by the application operations.
export interface ClientOperationsConnection extends Omit<RestConnection, "client"> {
  readonly client: Effect.Effect<TxOperations, HulyClientError>
  readonly resolveFullConnection?: Effect.Effect<RestConnection, HulyClientError>
  readonly findProjectDocuments?: (
    query: DocumentQuery<HulyProject>,
    options?: FindOptions<HulyProject>
  ) => Effect.Effect<FindResult<HulyProject>, HulyClientError>
}
export const makeClientOperations = (
  connection: ClientOperationsConnection,
  sdk: HulySdkDependencies,
  config: { readonly url: string }
): HulyClientOperations => {
  const { accountUuid, client, imageUrl, primarySocialId, refUrl, socialIds, workspaceUrlSlug } = connection
  const markupUrlConfig: MarkupUrlConfig = { refUrl: UrlString.make(refUrl), imageUrl: UrlString.make(imageUrl) }
  const workbenchUrlConfig: WorkbenchUrlConfig = { baseUrl: UrlString.make(config.url), workspaceUrlSlug }

  const withClient = <A>(
    op: (client: TxOperations) => Promise<A>,
    operation: HulyConnectionOperation
  ): Effect.Effect<A, HulyClientError> =>
    client.pipe(
      Effect.flatMap((value) =>
        Effect.tryPromise({ try: () => op(value), catch: (error) => makeOperationConnectionError(operation, error) })
      )
    )

  const fullConnection = connection.resolveFullConnection ?? Effect.map(client, (client) => ({ ...connection, client }))
  const operations: HulyClientOperations = {
    ...(connection.findProjectDocuments === undefined ? {} : { findProjectDocuments: connection.findProjectDocuments }),
    inspectMovementTransactions: (queued) =>
      Effect.flatMap(client, (value) => inspectMovementTransactions(value, queued)),
    inspectTransferRecords: (issueId, tree) =>
      Effect.flatMap(client, (value) => inspectTransferRecords(value, issueId, undefined, tree)),
    inspectTransferForest: (roots, tree, publish) =>
      Effect.flatMap(client, (value) => inspectTransferForest(value, roots, tree, publish)),
    commitTransferTree: (write, publishQueuedTransactions) =>
      Effect.gen(function* () {
        const context = yield* Effect.context<never>()
        const { client: txClient, movementTransportConfig } = yield* fullConnection
        const result = yield* withMovementWriteClient(
          txClient,
          movementTransportConfig,
          sdk.movementHttp,
          "conditionalUpdateDoc",
          (movement, signal) =>
            commitTransferTree(
              movement,
              write,
              publishQueuedTransactions === undefined
                ? undefined
                : (transactions, batch) =>
                    Effect.runPromiseWith(context)(publishQueuedTransactions(transactions, batch), { signal })
            )
        )
        return yield* Effect.fromResult(result)
      }),
    commitTransfer: (write) =>
      Effect.flatMap(fullConnection, ({ client: value, movementTransportConfig }) =>
        withMovementWriteClient(value, movementTransportConfig, sdk.movementHttp, "conditionalUpdateDoc", (movement) =>
          commitTransfer(movement, write)
        )
      ),
    allocateMovementNumber: (destinationId) =>
      Effect.flatMap(fullConnection, ({ client: value, movementTransportConfig }) =>
        withMovementWriteClient(value, movementTransportConfig, sdk.movementHttp, "updateDoc", (movement) =>
          movement.updateDoc(
            tracker.class.Project,
            core.space.Space,
            toRef(destinationId),
            { $inc: { sequence: 1 } },
            true
          )
        )
      ),
    getAccountUuid: () => accountUuid,
    getPrimarySocialId: () => primarySocialId,
    getSocialIds: () => socialIds,
    workbenchUrlConfig,
    markupUrlConfig,

    findAll: <T extends Doc>(_class: Ref<Class<T>>, query: DocumentQuery<T>, options?: FindOptions<T>) =>
      withClient((client) => client.findAll(_class, query, options), "findAll"),

    findOne: <T extends Doc>(_class: Ref<Class<T>>, query: DocumentQuery<T>, options?: FindOptions<T>) =>
      withClient((client) => client.findOne(_class, query, options), "findOne"),

    findAllInModel: <T extends Doc>(_class: Ref<Class<T>>, query: DocumentQuery<T>, options?: FindOptions<T>) =>
      withClient((client) => Promise.resolve(client.getModel().findAllSync(_class, query, options)), "findAllInModel"),

    createDoc: <T extends Doc>(_class: Ref<Class<T>>, space: Ref<Space>, attributes: Data<T>, id?: Ref<T>) =>
      withClient((client) => client.createDoc(_class, space, attributes, id), "createDoc"),

    createDocIfNotMatched: <T extends Doc, M extends Doc>(
      _class: Ref<Class<T>>,
      space: Ref<Space>,
      attributes: Data<T>,
      id: Ref<T>,
      matchClass: Ref<Class<M>>,
      matchQuery: DocumentQuery<M>,
      scope: HulyTransactionScope
    ) =>
      withClient(async (client) => {
        const apply = client.apply(scope)
        apply.notMatch(matchClass, matchQuery)
        await apply.createDoc(_class, space, attributes, id)
        return (await apply.commit()).result ? "applied" : "condition-not-met"
      }, "conditionalCreateDoc"),

    updateDoc: <T extends Doc>(
      _class: Ref<Class<T>>,
      space: Ref<Space>,
      objectId: Ref<T>,
      ops: DocumentUpdate<T>,
      retrieve?: boolean
    ) => withClient((client) => client.updateDoc(_class, space, objectId, ops, retrieve), "updateDoc"),

    updateDocIfMatched: <T extends Doc>(
      _class: Ref<Class<T>>,
      space: Ref<Space>,
      objectId: Ref<T>,
      matchQuery: DocumentQuery<T>,
      operations: DocumentUpdate<T>,
      scope: HulyTransactionScope
    ) =>
      withClient(async (client) => {
        const apply = client.apply(scope)
        apply.match(_class, matchQuery)
        await apply.updateDoc(_class, space, objectId, operations)
        return (await apply.commit()).result ? "applied" : "condition-not-met"
      }, "conditionalUpdateDoc"),

    addCollection: <T extends Doc, P extends AttachedDoc>(
      _class: Ref<Class<P>>,
      space: Ref<Space>,
      attachedTo: Ref<T>,
      attachedToClass: Ref<Class<T>>,
      collection: string,
      attributes: AttachedData<P>,
      id?: Ref<P>
    ) =>
      withClient(
        (client) => client.addCollection(_class, space, attachedTo, attachedToClass, collection, attributes, id),
        "addCollection"
      ),

    updateCollection: <T extends Doc, P extends AttachedDoc>(
      _class: Ref<Class<P>>,
      space: Ref<Space>,
      objectId: Ref<P>,
      attachedTo: Ref<T>,
      attachedToClass: Ref<Class<T>>,
      collection: Extract<keyof T, string> | string,
      operations: DocumentUpdate<P>,
      retrieve?: boolean
    ) =>
      withClient(
        (client) =>
          client.updateCollection(
            _class,
            space,
            objectId,
            attachedTo,
            attachedToClass,
            collection,
            operations,
            retrieve
          ),
        "updateCollection"
      ),

    removeCollection: <T extends Doc, P extends AttachedDoc>(
      _class: Ref<Class<P>>,
      space: Ref<Space>,
      objectId: Ref<P>,
      attachedTo: Ref<T>,
      attachedToClass: Ref<Class<T>>,
      collection: Extract<keyof T, string> | string
    ) =>
      withClient(
        (client) => client.removeCollection(_class, space, objectId, attachedTo, attachedToClass, collection),
        "removeCollection"
      ),

    removeDoc: <T extends Doc>(_class: Ref<Class<T>>, space: Ref<Space>, objectId: Ref<T>) =>
      withClient((client) => client.removeDoc(_class, space, objectId), "removeDoc"),

    removeDocIfMatched: <T extends Doc>(
      _class: Ref<Class<T>>,
      space: Ref<Space>,
      objectId: Ref<T>,
      matchQuery: DocumentQuery<T>,
      scope: HulyTransactionScope
    ) =>
      withClient(async (client) => {
        const apply = client.apply(scope)
        apply.match(_class, matchQuery)
        await apply.removeDoc(_class, space, objectId)
        return (await apply.commit()).result ? "applied" : "condition-not-met"
      }, "conditionalRemoveDoc"),

    createMixin: <D extends Doc, M extends D>(
      objectId: Ref<D>,
      objectClass: Ref<Class<D>>,
      objectSpace: Ref<Space>,
      mixin: Ref<Mixin<M>>,
      attributes: MixinData<D, M>
    ) =>
      withClient((client) => client.createMixin(objectId, objectClass, objectSpace, mixin, attributes), "createMixin"),

    commitEmployeePreparation: (preparation) =>
      withClient((client) => executeEmployeePreparation(client, preparation), "commitEmployeePreparation"),

    updateMixin: <D extends Doc, M extends D>(
      objectId: Ref<D>,
      objectClass: Ref<Class<D>>,
      objectSpace: Ref<Space>,
      mixin: Ref<Mixin<M>>,
      attributes: MixinUpdate<D, M>
    ) =>
      withClient((client) => client.updateMixin(objectId, objectClass, objectSpace, mixin, attributes), "updateMixin"),

    uploadMarkup: (objectClass, objectId, objectAttr, markup, format) =>
      Effect.flatMap(fullConnection, ({ markupOps }) =>
        Effect.tryPromise({
          try: () => markupOps.uploadMarkup(objectClass, objectId, objectAttr, markup, format),
          catch: (error) => makeOperationConnectionError("uploadMarkup", error)
        })
      ),

    fetchMarkup: (objectClass, objectId, objectAttr, id, format) =>
      Effect.flatMap(fullConnection, ({ markupOps }) =>
        Effect.tryPromise({
          try: () => markupOps.fetchMarkup(objectClass, objectId, objectAttr, id, format),
          catch: (error) => makeOperationConnectionError("fetchMarkup", error)
        })
      ),

    updateMarkup: (objectClass, objectId, objectAttr, markup, format) =>
      Effect.flatMap(fullConnection, ({ markupOps }) =>
        Effect.tryPromise({
          try: () => markupOps.updateMarkup(objectClass, objectId, objectAttr, markup, format),
          catch: (error) => makeOperationConnectionError("updateMarkup", error)
        })
      ),

    searchFulltext: (query, options) => withClient((client) => client.searchFulltext(query, options), "searchFulltext"),

    resolvePersonAdministrationTarget: (locator) => resolvePersonAdministrationTarget(operations, locator),

    inspectPersonReferences: (source) =>
      Effect.flatMap(client, (value) => inspectNativePersonReferences(value, source)),

    migratePersonReferences: (impacts, source, survivor) =>
      Effect.flatMap(client, (value) => migrateNativePersonReferences(value, impacts, source, survivor))
  }

  return operations
}
