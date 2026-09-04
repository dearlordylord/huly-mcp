/**
 * HulyClient - Data operations within a workspace.
 *
 * Uses @hcengineering/api-client (TxOperations) for CRUD on documents:
 * issues, projects, milestones, documents, contacts, comments, etc.
 *
 * For workspace/account management (members, settings, workspace lifecycle),
 * see WorkspaceClient in workspace-client.ts.
 *
 * @module
 */
/* eslint-disable max-lines -- connection setup and client operation wiring live in one module */
import { type AuthOptions, type MarkupFormat, type MarkupRef } from "@hcengineering/api-client"
import {
  type AccountUuid,
  type AttachedData,
  type AttachedDoc,
  type Class,
  type Data,
  type Doc,
  type DocumentQuery,
  type DocumentUpdate,
  type FindOptions,
  type FindResult,
  makeCollabId,
  type Mixin,
  type MixinData,
  type MixinUpdate,
  type PersonId,
  type Ref,
  type SearchOptions,
  type SearchQuery,
  type SearchResult,
  type Space,
  toFindResult,
  type TxOperations,
  type TxResult,
  type WithLookup,
  type WorkspaceUuid
} from "@hcengineering/core"
import { absurd, Context, Effect, Layer, Redacted, Schedule } from "effect"

import { type Auth, HulyConfigService } from "../config/config.js"
import type { PersonAdministrationLocator } from "../domain/schemas/person-administration.js"
import type { PersonMergeReferenceImpact } from "../domain/schemas/person-merge.js"
import {
  AccountUuid as ParsedAccountUuid,
  type HulyConditionalWriteResult,
  type HulyTransactionScope,
  type PersonId as DomainPersonId,
  NonEmptyString,
  UrlString,
  WorkspaceUrlSlug
} from "../domain/schemas/shared.js"
import { concatLink } from "../utils/url.js"
import {
  HulyAuthError,
  type HulyConnectionOperation,
  type HulyConnectionError,
  type HulyDataInvalidError,
  HulyUnavailableError,
  makeOperationConnectionError
} from "./errors-base.js"
import type { PersonMergeSnapshotStaleError } from "./errors-person-administration.js"
import { executeEmployeePreparation, type EmployeePreparationPlan } from "./employee-preparation.js"
import { PlatformError } from "./huly-platform.js"
import {
  markdownInputUrlConfig,
  markupNodeToMarkdownString,
  type MarkupUrlConfig,
  testMarkupUrlConfig,
  transformMarkupNodeNativeReferenceLinks
} from "./operations/markup.js"
import type { ResolvedPerson } from "./operations/person-administration-boundaries.js"
import {
  resolvePersonAdministrationTarget,
  type ResolvePersonAdministrationError
} from "./operations/person-administration-shared.js"
import { toAccountUuid, toCorePersonId } from "./operations/sdk-boundary.js"
import { HulySdk, type HulySdkDependencies } from "./sdk-deps.js"
import { acquireClosableClient } from "./scoped-client.js"
import { classifyHulyUnavailableFailure, normalizeHulyOrigin } from "./unavailable-diagnostics.js"
import { testWorkbenchUrlConfig, type WorkbenchUrlConfig } from "./url-builders.js"
import { inspectNativePersonReferences, migrateNativePersonReferences } from "./person-reference-migration.js"

// --- Connection helpers ---

/**
 * Status codes that indicate authentication failures (should not be retried).
 *
 * These are StatusCode values from @hcengineering/platform (see platform.ts).
 * The default export `platform.status.*` can't be imported due to TypeScript's
 * verbatimModuleSyntax + NodeNext moduleResolution not resolving the re-exported
 * default correctly. The format is `${pluginId}:status:${statusName}` where
 * pluginId is "platform".
 */
const AUTH_STATUS_CODES = new Set([
  "platform:status:Unauthorized",
  "platform:status:TokenExpired",
  "platform:status:TokenNotActive",
  "platform:status:PasswordExpired",
  "platform:status:Forbidden",
  "platform:status:InvalidPassword",
  "platform:status:AccountNotFound",
  "platform:status:AccountNotConfirmed"
])

/**
 * Connection configuration shared by HulyClient, WorkspaceClient, and HulyStorageClient.
 */
export interface ConnectionConfig {
  url: string
  auth: Auth
  workspace: string
}

export type ConnectionError = HulyConnectionError | HulyUnavailableError | HulyAuthError

/**
 * Convert Auth union type to AuthOptions for API client.
 */
export const authToOptions = (auth: Auth, workspace: string): AuthOptions =>
  auth._tag === "token"
    ? { token: Redacted.value(auth.token), workspace }
    : { email: auth.email, password: Redacted.value(auth.password), workspace }

const isAuthError = (error: unknown): boolean =>
  error instanceof PlatformError && AUTH_STATUS_CODES.has(error.status.code)

const MAX_RETRIES = 2
const connectionRetrySchedule = Schedule.exponential("100 millis")

const withConnectionRetry = <A>(attempt: Effect.Effect<A, ConnectionError>): Effect.Effect<A, ConnectionError> =>
  attempt.pipe(
    Effect.retry({ schedule: connectionRetrySchedule, times: MAX_RETRIES, while: (e) => !(e instanceof HulyAuthError) })
  )

/**
 * Connect with retry: wraps a Promise-returning function in Effect.tryPromise,
 * maps errors to HulyAuthError/HulyConnectionError, and applies connection retry.
 */
export const connectWithRetry = <A>(
  connect: () => Promise<A>,
  endpointUrl: string
): Effect.Effect<A, ConnectionError> =>
  withConnectionRetry(
    Effect.tryPromise({
      try: connect,
      catch: (e) => {
        if (isAuthError(e)) {
          return new HulyAuthError({ message: "Credentials or workspace authorization failed" })
        }
        const [failureKind, detailCode] = classifyHulyUnavailableFailure(e)
        const endpointOrigin = normalizeHulyOrigin(endpointUrl)
        const diagnostic = { endpointOrigin, failureKind, ...(detailCode === undefined ? {} : { detailCode }) }
        return new HulyUnavailableError(diagnostic)
      }
    })
  )

type MarkupConvertOptions = MarkupUrlConfig

function toInternalMarkup(
  value: string,
  format: MarkupFormat,
  opts: MarkupConvertOptions,
  sdk: HulySdkDependencies
): string {
  switch (format) {
    case "markup":
      return value
    case "html":
      return sdk.jsonToMarkup(sdk.htmlToJSON(value))
    case "markdown":
      return sdk.jsonToMarkup(
        transformMarkupNodeNativeReferenceLinks(sdk.markdownToMarkup(value, markdownInputUrlConfig(opts)), opts).node
      )
    default:
      absurd(format)
      throw new Error("Invalid markup format")
  }
}

function fromInternalMarkup(
  markup: string,
  format: MarkupFormat,
  opts: MarkupConvertOptions,
  sdk: HulySdkDependencies
): string {
  switch (format) {
    case "markup":
      return markup
    case "html":
      return sdk.jsonToHTML(sdk.markupToJSON(markup))
    case "markdown":
      return markupNodeToMarkdownString(sdk.markupToJSON(markup), opts, sdk.markupToMarkdown)
    default:
      absurd(format)
      throw new Error("Invalid markup format")
  }
}

export type HulyClientError = ConnectionError

interface HulyClientContext {
  readonly markupUrlConfig: MarkupUrlConfig
  readonly workbenchUrlConfig: WorkbenchUrlConfig
}

export interface HulyClientOperations extends HulyClientContext {
  readonly getAccountUuid: () => AccountUuid
  readonly getPrimarySocialId: () => PersonId
  readonly getSocialIds?: () => ReadonlyArray<PersonId>

  readonly findAll: <T extends Doc>(
    _class: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ) => Effect.Effect<FindResult<T>, HulyClientError>

  readonly findOne: <T extends Doc>(
    _class: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ) => Effect.Effect<WithLookup<T> | undefined, HulyClientError>

  /**
   * Query documents from the client-side model instead of the server.
   * Model-space documents are loaded at connection time, so this can still
   * resolve metadata when a server-side model document query fails.
   */
  readonly findAllInModel: <T extends Doc>(
    _class: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ) => Effect.Effect<FindResult<T>, HulyClientError>

  readonly createDoc: <T extends Doc>(
    _class: Ref<Class<T>>,
    space: Ref<Space>,
    attributes: Data<T>,
    id?: Ref<T>
  ) => Effect.Effect<Ref<T>, HulyClientError>

  readonly createDocIfNotMatched?: <T extends Doc, M extends Doc>(
    _class: Ref<Class<T>>,
    space: Ref<Space>,
    attributes: Data<T>,
    id: Ref<T>,
    matchClass: Ref<Class<M>>,
    matchQuery: DocumentQuery<M>,
    scope: HulyTransactionScope
  ) => Effect.Effect<HulyConditionalWriteResult, HulyClientError>

  readonly updateDoc: <T extends Doc>(
    _class: Ref<Class<T>>,
    space: Ref<Space>,
    objectId: Ref<T>,
    operations: DocumentUpdate<T>,
    retrieve?: boolean
  ) => Effect.Effect<TxResult, HulyClientError>

  readonly updateDocIfMatched?: <T extends Doc>(
    _class: Ref<Class<T>>,
    space: Ref<Space>,
    objectId: Ref<T>,
    matchQuery: DocumentQuery<T>,
    operations: DocumentUpdate<T>,
    scope: HulyTransactionScope
  ) => Effect.Effect<HulyConditionalWriteResult, HulyClientError>

  readonly updateCollection?: <T extends Doc, P extends AttachedDoc>(
    _class: Ref<Class<P>>,
    space: Ref<Space>,
    objectId: Ref<P>,
    attachedTo: Ref<T>,
    attachedToClass: Ref<Class<T>>,
    collection: Extract<keyof T, string> | string,
    operations: DocumentUpdate<P>,
    retrieve?: boolean
  ) => Effect.Effect<Ref<T>, HulyClientError>

  readonly addCollection: <T extends Doc, P extends AttachedDoc>(
    _class: Ref<Class<P>>,
    space: Ref<Space>,
    attachedTo: Ref<T>,
    attachedToClass: Ref<Class<T>>,
    collection: string,
    attributes: AttachedData<P>,
    id?: Ref<P>
  ) => Effect.Effect<Ref<P>, HulyClientError>

  readonly removeCollection?: <T extends Doc, P extends AttachedDoc>(
    _class: Ref<Class<P>>,
    space: Ref<Space>,
    objectId: Ref<P>,
    attachedTo: Ref<T>,
    attachedToClass: Ref<Class<T>>,
    collection: Extract<keyof T, string> | string
  ) => Effect.Effect<Ref<T>, HulyClientError>

  readonly removeDoc: <T extends Doc>(
    _class: Ref<Class<T>>,
    space: Ref<Space>,
    objectId: Ref<T>
  ) => Effect.Effect<TxResult, HulyClientError>

  readonly removeDocIfMatched?: <T extends Doc>(
    _class: Ref<Class<T>>,
    space: Ref<Space>,
    objectId: Ref<T>,
    matchQuery: DocumentQuery<T>,
    scope: HulyTransactionScope
  ) => Effect.Effect<HulyConditionalWriteResult, HulyClientError>

  readonly uploadMarkup: (
    objectClass: Ref<Class<Doc>>,
    objectId: Ref<Doc>,
    objectAttr: string,
    markup: string,
    format: MarkupFormat
  ) => Effect.Effect<MarkupRef, HulyClientError>

  readonly fetchMarkup: (
    objectClass: Ref<Class<Doc>>,
    objectId: Ref<Doc>,
    objectAttr: string,
    id: MarkupRef,
    format: MarkupFormat
  ) => Effect.Effect<string, HulyClientError>

  readonly updateMarkup: (
    objectClass: Ref<Class<Doc>>,
    objectId: Ref<Doc>,
    objectAttr: string,
    markup: string,
    format: MarkupFormat
  ) => Effect.Effect<void, HulyClientError>

  readonly createMixin: <D extends Doc, M extends D>(
    objectId: Ref<D>,
    objectClass: Ref<Class<D>>,
    objectSpace: Ref<Space>,
    mixin: Ref<Mixin<M>>,
    attributes: MixinData<D, M>
  ) => Effect.Effect<TxResult, HulyClientError>

  /** Commit a checked Person, email identity, and Employee preparation as one Apply transaction. */
  readonly commitEmployeePreparation?: (
    preparation: EmployeePreparationPlan
  ) => Effect.Effect<HulyConditionalWriteResult, HulyClientError>

  readonly updateMixin: <D extends Doc, M extends D>(
    objectId: Ref<D>,
    objectClass: Ref<Class<D>>,
    objectSpace: Ref<Space>,
    mixin: Ref<Mixin<M>>,
    attributes: MixinUpdate<D, M>
  ) => Effect.Effect<TxResult, HulyClientError>

  readonly searchFulltext: (query: SearchQuery, options: SearchOptions) => Effect.Effect<SearchResult, HulyClientError>

  readonly resolvePersonAdministrationTarget?: (
    locator: PersonAdministrationLocator
  ) => Effect.Effect<ResolvedPerson, ResolvePersonAdministrationError>

  readonly inspectPersonReferences?: (
    source: DomainPersonId
  ) => Effect.Effect<ReadonlyArray<PersonMergeReferenceImpact>, HulyClientError | HulyDataInvalidError>

  readonly migratePersonReferences?: (
    impacts: ReadonlyArray<PersonMergeReferenceImpact>,
    source: DomainPersonId,
    survivor: DomainPersonId
  ) => Effect.Effect<void, HulyClientError | HulyDataInvalidError | PersonMergeSnapshotStaleError>
}

export class HulyClient extends Context.Service<HulyClient, HulyClientOperations>()("@hulymcp/HulyClient") {
  static readonly layerWithDependencies: Layer.Layer<HulyClient, HulyClientError, HulyConfigService | HulySdk> =
    Layer.effect(
      HulyClient,
      Effect.gen(function* () {
        const config = yield* HulyConfigService
        const sdk = yield* HulySdk

        const { accountUuid, client, imageUrl, markupOps, primarySocialId, refUrl, socialIds, workspaceUrlSlug } =
          yield* acquireClosableClient(
            connectRestWithRetry({ url: config.url, auth: config.auth, workspace: config.workspace }, sdk)
          )

        const markupUrlConfig: MarkupUrlConfig = { refUrl: UrlString.make(refUrl), imageUrl: UrlString.make(imageUrl) }
        const workbenchUrlConfig: WorkbenchUrlConfig = { baseUrl: UrlString.make(config.url), workspaceUrlSlug }

        const withClient = <A>(
          op: (client: TxOperations) => Promise<A>,
          operation: HulyConnectionOperation
        ): Effect.Effect<A, HulyClientError> =>
          Effect.tryPromise({ try: () => op(client), catch: (error) => makeOperationConnectionError(operation, error) })

        const operations: HulyClientOperations = {
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
            withClient(
              (client) => Promise.resolve(client.getModel().findAllSync(_class, query, options)),
              "findAllInModel"
            ),

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
            withClient(
              (client) => client.createMixin(objectId, objectClass, objectSpace, mixin, attributes),
              "createMixin"
            ),

          commitEmployeePreparation: (preparation) =>
            withClient((client) => executeEmployeePreparation(client, preparation), "commitEmployeePreparation"),

          updateMixin: <D extends Doc, M extends D>(
            objectId: Ref<D>,
            objectClass: Ref<Class<D>>,
            objectSpace: Ref<Space>,
            mixin: Ref<Mixin<M>>,
            attributes: MixinUpdate<D, M>
          ) =>
            withClient(
              (client) => client.updateMixin(objectId, objectClass, objectSpace, mixin, attributes),
              "updateMixin"
            ),

          uploadMarkup: (objectClass, objectId, objectAttr, markup, format) =>
            Effect.tryPromise({
              try: () => markupOps.uploadMarkup(objectClass, objectId, objectAttr, markup, format),
              catch: (error) => makeOperationConnectionError("uploadMarkup", error)
            }),

          fetchMarkup: (objectClass, objectId, objectAttr, id, format) =>
            Effect.tryPromise({
              try: () => markupOps.fetchMarkup(objectClass, objectId, objectAttr, id, format),
              catch: (error) => makeOperationConnectionError("fetchMarkup", error)
            }),

          updateMarkup: (objectClass, objectId, objectAttr, markup, format) =>
            Effect.tryPromise({
              try: () => markupOps.updateMarkup(objectClass, objectId, objectAttr, markup, format),
              catch: (error) => makeOperationConnectionError("updateMarkup", error)
            }),

          searchFulltext: (query, options) =>
            withClient((client) => client.searchFulltext(query, options), "searchFulltext"),

          resolvePersonAdministrationTarget: (locator) => resolvePersonAdministrationTarget(operations, locator),

          inspectPersonReferences: (source) => inspectNativePersonReferences(client, source),

          migratePersonReferences: (impacts, source, survivor) =>
            migrateNativePersonReferences(client, impacts, source, survivor)
        }

        return operations
      })
    )

  static readonly layer: Layer.Layer<HulyClient, HulyClientError, HulyConfigService> =
    HulyClient.layerWithDependencies.pipe(Layer.provide(HulySdk.defaultLayer))

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
      getPrimarySocialId: () => toCorePersonId(NonEmptyString.make("test-primary-social-id")),
      getSocialIds: () => [toCorePersonId(NonEmptyString.make("test-primary-social-id"))],
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

interface MarkupOperations {
  fetchMarkup: (
    objectClass: Ref<Class<Doc>>,
    objectId: Ref<Doc>,
    objectAttr: string,
    id: MarkupRef,
    format: MarkupFormat
  ) => Promise<string>
  uploadMarkup: (
    objectClass: Ref<Class<Doc>>,
    objectId: Ref<Doc>,
    objectAttr: string,
    markup: string,
    format: MarkupFormat
  ) => Promise<MarkupRef>
  updateMarkup: (
    objectClass: Ref<Class<Doc>>,
    objectId: Ref<Doc>,
    objectAttr: string,
    markup: string,
    format: MarkupFormat
  ) => Promise<void>
}

interface RestConnection {
  client: TxOperations
  accountUuid: AccountUuid
  primarySocialId: PersonId
  socialIds: ReadonlyArray<PersonId>
  workspaceUrlSlug: WorkspaceUrlSlug
  markupOps: MarkupOperations
  refUrl: UrlString
  imageUrl: UrlString
}

// Full model loading is a one-time connection cost that makes workflow/notification definitions
// available from the local model. It avoids unsupported REST metadata endpoints on current Huly.
const LOAD_FULL_MODEL_FOR_AUTHORITATIVE_METADATA = true

function createMarkupOps(
  url: string,
  workspace: WorkspaceUuid,
  token: string,
  collaboratorUrl: string,
  sdk: HulySdkDependencies
): { ops: MarkupOperations; refUrl: UrlString; imageUrl: UrlString } {
  // @hcengineering/text-markdown expects refUrl/imageUrl option names, but the Huly SDK does not
  // expose helpers or constants for the concrete workspace browse/files routes. We derive those
  // Huly-specific URLs here from the connected base URL and workspace id so markdown round-trips
  // preserve links and images across entities.
  const refUrl = UrlString.make(concatLink(url, `/browse?workspace=${workspace}`))
  const imageUrl = UrlString.make(concatLink(url, `/files?workspace=${workspace}&file=`))
  const collaborator = sdk.getCollaboratorClient(workspace, token, collaboratorUrl)

  return {
    refUrl,
    imageUrl,
    ops: {
      async fetchMarkup(objectClass, objectId, objectAttr, doc, format) {
        const collabId = makeCollabId(objectClass, objectId, objectAttr)
        const markup = await collaborator.getMarkup(collabId, doc)
        return fromInternalMarkup(markup, format, { refUrl, imageUrl }, sdk)
      },

      async uploadMarkup(objectClass, objectId, objectAttr, value, format) {
        const collabId = makeCollabId(objectClass, objectId, objectAttr)
        return await collaborator.createMarkup(collabId, toInternalMarkup(value, format, { refUrl, imageUrl }, sdk))
      },

      async updateMarkup(objectClass, objectId, objectAttr, value, format) {
        const collabId = makeCollabId(objectClass, objectId, objectAttr)
        return await collaborator.updateMarkup(collabId, toInternalMarkup(value, format, { refUrl, imageUrl }, sdk))
      }
    }
  }
}

const connectRest = async (config: ConnectionConfig, sdk: HulySdkDependencies): Promise<RestConnection> => {
  const serverConfig = await sdk.loadServerConfig(config.url)

  const authOptions = authToOptions(config.auth, config.workspace)

  const { endpoint, info, token, workspaceId } = await sdk.getWorkspaceToken(config.url, authOptions, serverConfig)

  // createRestTxOperations also calls getAccount() internally but doesn't expose it.
  // Extra call here is one-time at connection startup; acceptable to avoid reimplementing SDK internals.
  const restClient = sdk.createRestClient(endpoint, workspaceId, token)
  const account = await restClient.getAccount()

  const client = await sdk.createRestTxOperations(
    endpoint,
    workspaceId,
    token,
    LOAD_FULL_MODEL_FOR_AUTHORITATIVE_METADATA
  )
  const {
    imageUrl,
    ops: markupOps,
    refUrl
  } = createMarkupOps(config.url, workspaceId, token, serverConfig.COLLABORATOR_URL, sdk)

  return {
    client,
    accountUuid: account.uuid,
    primarySocialId: account.primarySocialId,
    socialIds: account.socialIds,
    workspaceUrlSlug: WorkspaceUrlSlug.make(info.workspaceUrl),
    markupOps,
    refUrl,
    imageUrl
  }
}

const connectRestWithRetry = (
  config: ConnectionConfig,
  sdk: HulySdkDependencies
): Effect.Effect<RestConnection, ConnectionError> => connectWithRetry(() => connectRest(config, sdk), config.url)
