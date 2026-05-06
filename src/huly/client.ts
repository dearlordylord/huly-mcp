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
import { PlatformError } from "@hcengineering/platform"
import { absurd, Context, Effect, Layer, Redacted, Schedule } from "effect"

import { type Auth, HulyConfigService } from "../config/config.js"
import { UrlString, WorkspaceUrlSlug } from "../domain/schemas/shared.js"
import { concatLink } from "../utils/url.js"
import { HulyAuthError, HulyConnectionError } from "./errors.js"
import { type MarkupUrlConfig, testMarkupUrlConfig } from "./operations/markup.js"
import { HulySdk, type HulySdkDependencies } from "./sdk-deps.js"
import type { DocumentUrlConfig } from "./url-builders.js"

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

export type ConnectionError = HulyConnectionError | HulyAuthError

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
const connectionRetrySchedule = Schedule.exponential("100 millis").pipe(
  Schedule.compose(Schedule.recurs(MAX_RETRIES))
)

const withConnectionRetry = <A>(
  attempt: Effect.Effect<A, ConnectionError>
): Effect.Effect<A, ConnectionError> =>
  attempt.pipe(
    Effect.retry({
      schedule: connectionRetrySchedule,
      while: (e) => !(e instanceof HulyAuthError)
    })
  )

/**
 * Connect with retry: wraps a Promise-returning function in Effect.tryPromise,
 * maps errors to HulyAuthError/HulyConnectionError, and applies connection retry.
 */
export const connectWithRetry = <A>(
  connect: () => Promise<A>,
  errorPrefix: string
): Effect.Effect<A, ConnectionError> =>
  withConnectionRetry(
    Effect.tryPromise({
      try: connect,
      catch: (e) => {
        if (isAuthError(e)) {
          return new HulyAuthError({
            message: `${errorPrefix}: ${String(e)}`
          })
        }
        return new HulyConnectionError({
          message: `${errorPrefix}: ${String(e)}`,
          cause: e
        })
      }
    })
  )

interface MarkupConvertOptions {
  readonly refUrl: string
  readonly imageUrl: string
}

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
      return sdk.jsonToMarkup(sdk.markdownToMarkup(value, opts))
    default:
      absurd(format)
      throw new Error(`Invalid format: ${format}`)
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
      return sdk.markupToMarkdown(sdk.markupToJSON(markup), opts)
    default:
      absurd(format)
      throw new Error(`Invalid format: ${format}`)
  }
}

export type HulyClientError = ConnectionError

interface HulyClientContext {
  readonly markupUrlConfig: MarkupUrlConfig
  readonly documentUrlConfig: DocumentUrlConfig
}

export interface HulyClientOperations extends HulyClientContext {
  readonly getAccountUuid: () => AccountUuid
  readonly getPrimarySocialId: () => PersonId

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

  readonly createDoc: <T extends Doc>(
    _class: Ref<Class<T>>,
    space: Ref<Space>,
    attributes: Data<T>,
    id?: Ref<T>
  ) => Effect.Effect<Ref<T>, HulyClientError>

  readonly updateDoc: <T extends Doc>(
    _class: Ref<Class<T>>,
    space: Ref<Space>,
    objectId: Ref<T>,
    operations: DocumentUpdate<T>,
    retrieve?: boolean
  ) => Effect.Effect<TxResult, HulyClientError>

  readonly addCollection: <T extends Doc, P extends AttachedDoc>(
    _class: Ref<Class<P>>,
    space: Ref<Space>,
    attachedTo: Ref<T>,
    attachedToClass: Ref<Class<T>>,
    collection: string,
    attributes: AttachedData<P>,
    id?: Ref<P>
  ) => Effect.Effect<Ref<P>, HulyClientError>

  readonly removeDoc: <T extends Doc>(
    _class: Ref<Class<T>>,
    space: Ref<Space>,
    objectId: Ref<T>
  ) => Effect.Effect<TxResult, HulyClientError>

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

  readonly updateMixin: <D extends Doc, M extends D>(
    objectId: Ref<D>,
    objectClass: Ref<Class<D>>,
    objectSpace: Ref<Space>,
    mixin: Ref<Mixin<M>>,
    attributes: MixinUpdate<D, M>
  ) => Effect.Effect<TxResult, HulyClientError>

  readonly searchFulltext: (
    query: SearchQuery,
    options: SearchOptions
  ) => Effect.Effect<SearchResult, HulyClientError>
}

export class HulyClient extends Context.Tag("@hulymcp/HulyClient")<
  HulyClient,
  HulyClientOperations
>() {
  static readonly layerWithDependencies: Layer.Layer<
    HulyClient,
    HulyClientError,
    HulyConfigService | HulySdk
  > = Layer.effect(
    HulyClient,
    Effect.gen(function*() {
      const config = yield* HulyConfigService
      const sdk = yield* HulySdk

      const {
        accountUuid,
        client,
        imageUrl,
        markupOps,
        primarySocialId,
        refUrl,
        workspaceUrlSlug
      } = yield* connectRestWithRetry({
        url: config.url,
        auth: config.auth,
        workspace: config.workspace
      }, sdk)

      const markupUrlConfig: MarkupUrlConfig = {
        refUrl: UrlString.make(refUrl),
        imageUrl: UrlString.make(imageUrl)
      }
      const documentUrlConfig: DocumentUrlConfig = {
        baseUrl: UrlString.make(config.url),
        workspaceUrlSlug
      }

      const withClient = <A>(
        op: (client: TxOperations) => Promise<A>,
        errorMsg: string
      ): Effect.Effect<A, HulyClientError> =>
        Effect.tryPromise({
          try: () => op(client),
          catch: (e) =>
            new HulyConnectionError({
              message: `${errorMsg}: ${String(e)}`,
              cause: e
            })
        })

      const operations: HulyClientOperations = {
        getAccountUuid: () => accountUuid,
        getPrimarySocialId: () => primarySocialId,
        documentUrlConfig,
        markupUrlConfig,

        findAll: <T extends Doc>(
          _class: Ref<Class<T>>,
          query: DocumentQuery<T>,
          options?: FindOptions<T>
        ) =>
          withClient(
            (client) => client.findAll(_class, query, options),
            "findAll failed"
          ),

        findOne: <T extends Doc>(
          _class: Ref<Class<T>>,
          query: DocumentQuery<T>,
          options?: FindOptions<T>
        ) =>
          withClient(
            (client) => client.findOne(_class, query, options),
            "findOne failed"
          ),

        createDoc: <T extends Doc>(
          _class: Ref<Class<T>>,
          space: Ref<Space>,
          attributes: Data<T>,
          id?: Ref<T>
        ) =>
          withClient(
            (client) => client.createDoc(_class, space, attributes, id),
            "createDoc failed"
          ),

        updateDoc: <T extends Doc>(
          _class: Ref<Class<T>>,
          space: Ref<Space>,
          objectId: Ref<T>,
          ops: DocumentUpdate<T>,
          retrieve?: boolean
        ) =>
          withClient(
            (client) => client.updateDoc(_class, space, objectId, ops, retrieve),
            "updateDoc failed"
          ),

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
            (client) =>
              client.addCollection(
                _class,
                space,
                attachedTo,
                attachedToClass,
                collection,
                attributes,
                id
              ),
            "addCollection failed"
          ),

        removeDoc: <T extends Doc>(
          _class: Ref<Class<T>>,
          space: Ref<Space>,
          objectId: Ref<T>
        ) =>
          withClient(
            (client) => client.removeDoc(_class, space, objectId),
            "removeDoc failed"
          ),

        createMixin: <D extends Doc, M extends D>(
          objectId: Ref<D>,
          objectClass: Ref<Class<D>>,
          objectSpace: Ref<Space>,
          mixin: Ref<Mixin<M>>,
          attributes: MixinData<D, M>
        ) =>
          withClient(
            (client) => client.createMixin(objectId, objectClass, objectSpace, mixin, attributes),
            "createMixin failed"
          ),

        updateMixin: <D extends Doc, M extends D>(
          objectId: Ref<D>,
          objectClass: Ref<Class<D>>,
          objectSpace: Ref<Space>,
          mixin: Ref<Mixin<M>>,
          attributes: MixinUpdate<D, M>
        ) =>
          withClient(
            (client) => client.updateMixin(objectId, objectClass, objectSpace, mixin, attributes),
            "updateMixin failed"
          ),

        uploadMarkup: (objectClass, objectId, objectAttr, markup, format) =>
          Effect.tryPromise({
            try: () => markupOps.uploadMarkup(objectClass, objectId, objectAttr, markup, format),
            catch: (e) =>
              new HulyConnectionError({
                message: `uploadMarkup failed: ${String(e)}`,
                cause: e
              })
          }),

        fetchMarkup: (objectClass, objectId, objectAttr, id, format) =>
          Effect.tryPromise({
            try: () => markupOps.fetchMarkup(objectClass, objectId, objectAttr, id, format),
            catch: (e) =>
              new HulyConnectionError({
                message: `fetchMarkup failed: ${String(e)}`,
                cause: e
              })
          }),

        updateMarkup: (objectClass, objectId, objectAttr, markup, format) =>
          Effect.tryPromise({
            try: () => markupOps.updateMarkup(objectClass, objectId, objectAttr, markup, format),
            catch: (e) =>
              new HulyConnectionError({
                message: `updateMarkup failed: ${String(e)}`,
                cause: e
              })
          }),

        searchFulltext: (query, options) =>
          withClient(
            (client) => client.searchFulltext(query, options),
            "searchFulltext failed"
          )
      }

      return operations
    })
  )

  static readonly layer: Layer.Layer<
    HulyClient,
    HulyClientError,
    HulyConfigService
  > = HulyClient.layerWithDependencies.pipe(Layer.provide(HulySdk.defaultLayer))

  static testLayer(
    mockOperations: Partial<HulyClientOperations>
  ): Layer.Layer<HulyClient> {
    const noopFindAll = <T extends Doc>(): Effect.Effect<
      FindResult<T>,
      HulyClientError
    > => Effect.succeed(toFindResult<T>([]))

    const noopFindOne = <T extends Doc>(): Effect.Effect<
      WithLookup<T> | undefined,
      HulyClientError
    > => Effect.succeed(undefined)

    const notImplemented = (name: string) => (): Effect.Effect<never, HulyClientError> =>
      Effect.die(new Error(`${name} not implemented in test layer`))

    const noopFetchMarkup = (): Effect.Effect<string, HulyClientError> => Effect.succeed("")

    const defaultOps: HulyClientOperations = {
      // AccountUuid is a double-branded string type with no public constructor
      // eslint-disable-next-line no-restricted-syntax -- see above
      getAccountUuid: () => "test-account-uuid" as AccountUuid,
      // PersonId is a branded string type with no public constructor
      // eslint-disable-next-line no-restricted-syntax -- see above
      getPrimarySocialId: () => "test-primary-social-id" as PersonId,
      documentUrlConfig: {
        baseUrl: UrlString.make("https://test.huly.local"),
        workspaceUrlSlug: WorkspaceUrlSlug.make("test-workspace")
      },
      markupUrlConfig: testMarkupUrlConfig,
      findAll: noopFindAll,
      findOne: noopFindOne,
      createDoc: notImplemented("createDoc"),
      updateDoc: notImplemented("updateDoc"),
      addCollection: notImplemented("addCollection"),
      removeDoc: notImplemented("removeDoc"),
      uploadMarkup: notImplemented("uploadMarkup"),
      fetchMarkup: noopFetchMarkup,
      createMixin: notImplemented("createMixin"),
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
  workspaceUrlSlug: WorkspaceUrlSlug
  markupOps: MarkupOperations
  refUrl: string
  imageUrl: string
}

function createMarkupOps(
  url: string,
  workspace: WorkspaceUuid,
  token: string,
  collaboratorUrl: string,
  sdk: HulySdkDependencies
): { ops: MarkupOperations; refUrl: string; imageUrl: string } {
  // @hcengineering/text-markdown expects refUrl/imageUrl option names, but the Huly SDK does not
  // expose helpers or constants for the concrete workspace browse/files routes. We derive those
  // Huly-specific URLs here from the connected base URL and workspace id so markdown round-trips
  // preserve links and images across entities.
  const refUrl = concatLink(url, `/browse?workspace=${workspace}`)
  const imageUrl = concatLink(url, `/files?workspace=${workspace}&file=`)
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

const connectRest = async (
  config: ConnectionConfig,
  sdk: HulySdkDependencies
): Promise<RestConnection> => {
  const serverConfig = await sdk.loadServerConfig(config.url)

  const authOptions = authToOptions(config.auth, config.workspace)

  const { endpoint, info, token, workspaceId } = await sdk.getWorkspaceToken(
    config.url,
    authOptions,
    serverConfig
  )

  // createRestTxOperations also calls getAccount() internally but doesn't expose it.
  // Extra call here is one-time at connection startup; acceptable to avoid reimplementing SDK internals.
  const restClient = sdk.createRestClient(endpoint, workspaceId, token)
  const account = await restClient.getAccount()

  const client = await sdk.createRestTxOperations(endpoint, workspaceId, token)
  const { imageUrl, ops: markupOps, refUrl } = createMarkupOps(
    config.url,
    workspaceId,
    token,
    serverConfig.COLLABORATOR_URL,
    sdk
  )

  return {
    client,
    accountUuid: account.uuid,
    primarySocialId: account.primarySocialId,
    workspaceUrlSlug: WorkspaceUrlSlug.make(info.workspaceUrl),
    markupOps,
    refUrl,
    imageUrl
  }
}

const connectRestWithRetry = (
  config: ConnectionConfig,
  sdk: HulySdkDependencies
): Effect.Effect<RestConnection, ConnectionError> =>
  connectWithRetry(() => connectRest(config, sdk), "Connection failed")
