/**
 * HulyClient service for Huly MCP server.
 *
 * Provides authenticated connection to Huly platform with:
 * - REST-based connection (stateless HTTP requests)
 * - Retry on connection failures
 * - Error mapping to HulyConnectionError/HulyAuthError
 *
 * @module
 */
import {
  createRestTxOperations,
  getWorkspaceToken,
  loadServerConfig,
  type MarkupFormat,
  type MarkupRef
} from "@hcengineering/api-client"
import { getClient as getCollaboratorClient } from "@hcengineering/collaborator-client"
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
  makeCollabId,
  type Ref,
  type Space,
  toFindResult,
  type TxOperations,
  type TxResult,
  type WithLookup,
  type WorkspaceUuid
} from "@hcengineering/core"
import { htmlToJSON, jsonToHTML, jsonToMarkup, markupToJSON } from "@hcengineering/text"
import { markdownToMarkup, markupToMarkdown } from "@hcengineering/text-markdown"
import { Context, Effect, Layer, Redacted, Schedule } from "effect"

import { HulyConfigService } from "../config/config.js"
import { HulyAuthError, HulyConnectionError } from "./errors.js"

// --- Error Type ---

/**
 * Union of errors that HulyClient operations can produce.
 */
export type HulyClientError = HulyConnectionError | HulyAuthError

// --- HulyClient Service Interface ---

/**
 * Operations exposed by the HulyClient service.
 * Wraps TxOperations methods with Effect error handling.
 */
export interface HulyClientOperations {
  /**
   * Find multiple documents.
   */
  readonly findAll: <T extends Doc>(
    _class: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ) => Effect.Effect<FindResult<T>, HulyClientError>

  /**
   * Find a single document.
   */
  readonly findOne: <T extends Doc>(
    _class: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ) => Effect.Effect<WithLookup<T> | undefined, HulyClientError>

  /**
   * Create a new document.
   */
  readonly createDoc: <T extends Doc>(
    _class: Ref<Class<T>>,
    space: Ref<Space>,
    attributes: Data<T>,
    id?: Ref<T>
  ) => Effect.Effect<Ref<T>, HulyClientError>

  /**
   * Update an existing document.
   */
  readonly updateDoc: <T extends Doc>(
    _class: Ref<Class<T>>,
    space: Ref<Space>,
    objectId: Ref<T>,
    operations: DocumentUpdate<T>,
    retrieve?: boolean
  ) => Effect.Effect<TxResult, HulyClientError>

  /**
   * Add a document to a collection.
   */
  readonly addCollection: <T extends Doc, P extends AttachedDoc>(
    _class: Ref<Class<P>>,
    space: Ref<Space>,
    attachedTo: Ref<T>,
    attachedToClass: Ref<Class<T>>,
    collection: string,
    attributes: AttachedData<P>,
    id?: Ref<P>
  ) => Effect.Effect<Ref<P>, HulyClientError>

  /**
   * Remove a document.
   */
  readonly removeDoc: <T extends Doc>(
    _class: Ref<Class<T>>,
    space: Ref<Space>,
    objectId: Ref<T>
  ) => Effect.Effect<TxResult, HulyClientError>

  /**
   * Upload markup content.
   */
  readonly uploadMarkup: (
    objectClass: Ref<Class<Doc>>,
    objectId: Ref<Doc>,
    objectAttr: string,
    markup: string,
    format: MarkupFormat
  ) => Effect.Effect<MarkupRef, HulyClientError>

  /**
   * Fetch markup content.
   */
  readonly fetchMarkup: (
    objectClass: Ref<Class<Doc>>,
    objectId: Ref<Doc>,
    objectAttr: string,
    id: MarkupRef,
    format: MarkupFormat
  ) => Effect.Effect<string, HulyClientError>
}

// --- HulyClient Service Tag ---

/**
 * HulyClient service tag.
 * Provides authenticated access to Huly platform operations.
 */
export class HulyClient extends Context.Tag("@hulymcp/HulyClient")<
  HulyClient,
  HulyClientOperations
>() {
  /**
   * Production layer - connects to Huly platform via REST.
   * Uses stateless HTTP requests instead of WebSocket.
   */
  static readonly layer: Layer.Layer<
    HulyClient,
    HulyClientError,
    HulyConfigService
  > = Layer.scoped(
    HulyClient,
    Effect.gen(function*() {
      const config = yield* HulyConfigService

      // Connect via REST with retry
      const { client, markupOps } = yield* connectRestWithRetry({
        url: config.url,
        email: config.email,
        password: Redacted.value(config.password),
        workspace: config.workspace
      })

      // Helper to wrap operations with error handling
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

      // Create service operations
      const operations: HulyClientOperations = {
        findAll: <T extends Doc>(
          _class: Ref<Class<T>>,
          query: DocumentQuery<T>,
          options?: FindOptions<T>
        ) =>
          withClient(
            (client) => client.findAll(_class, query, options),
            "findAll failed"
          ) as Effect.Effect<FindResult<T>, HulyClientError>,

        findOne: <T extends Doc>(
          _class: Ref<Class<T>>,
          query: DocumentQuery<T>,
          options?: FindOptions<T>
        ) =>
          withClient(
            (client) => client.findOne(_class, query, options),
            "findOne failed"
          ) as Effect.Effect<WithLookup<T> | undefined, HulyClientError>,

        createDoc: <T extends Doc>(
          _class: Ref<Class<T>>,
          space: Ref<Space>,
          attributes: Data<T>,
          id?: Ref<T>
        ) =>
          withClient(
            (client) => client.createDoc(_class, space, attributes, id),
            "createDoc failed"
          ) as Effect.Effect<Ref<T>, HulyClientError>,

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
          ) as Effect.Effect<Ref<P>, HulyClientError>,

        removeDoc: <T extends Doc>(
          _class: Ref<Class<T>>,
          space: Ref<Space>,
          objectId: Ref<T>
        ) =>
          withClient(
            (client) => client.removeDoc(_class, space, objectId),
            "removeDoc failed"
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
          })
      }

      return operations
    })
  )

  /**
   * Create a test layer with mock operations.
   * For unit testing without actual Huly connection.
   */
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

    const noopCreateDoc = <T extends Doc>(): Effect.Effect<
      Ref<T>,
      HulyClientError
    > => Effect.succeed("" as Ref<T>)

    const noopUpdateDoc = (): Effect.Effect<TxResult, HulyClientError> => Effect.succeed({})

    const noopAddCollection = <
      _T extends Doc,
      P extends AttachedDoc
    >(): Effect.Effect<Ref<P>, HulyClientError> => Effect.succeed("" as Ref<P>)

    const noopRemoveDoc = (): Effect.Effect<TxResult, HulyClientError> => Effect.succeed({})

    const noopUploadMarkup = (): Effect.Effect<MarkupRef, HulyClientError> => Effect.succeed("" as MarkupRef)

    const noopFetchMarkup = (): Effect.Effect<string, HulyClientError> => Effect.succeed("")

    const defaultOps: HulyClientOperations = {
      findAll: noopFindAll,
      findOne: noopFindOne,
      createDoc: noopCreateDoc,
      updateDoc: noopUpdateDoc,
      addCollection: noopAddCollection,
      removeDoc: noopRemoveDoc,
      uploadMarkup: noopUploadMarkup,
      fetchMarkup: noopFetchMarkup
    }

    return Layer.succeed(HulyClient, { ...defaultOps, ...mockOperations })
  }
}

// --- Internal Types ---

/**
 * Connection config for internal use.
 */
interface ConnectionConfig {
  url: string
  email: string
  password: string
  workspace: string
}

/**
 * Markup operations interface (matches internal Huly implementation).
 */
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
}

/**
 * REST connection result.
 */
interface RestConnection {
  client: TxOperations
  markupOps: MarkupOperations
}

// --- Internal Functions ---

/**
 * Concatenate URL host and path.
 */
const concatLink = (host: string, path: string): string => {
  const trimmedHost = host.endsWith("/") ? host.slice(0, -1) : host
  const trimmedPath = path.startsWith("/") ? path : `/${path}`
  return `${trimmedHost}${trimmedPath}`
}

/**
 * Check if error looks like an auth error.
 */
const isAuthError = (error: unknown): boolean => {
  const msg = String(error).toLowerCase()
  return (
    msg.includes("unauthorized")
    || msg.includes("authentication")
    || msg.includes("auth")
    || msg.includes("credentials")
    || msg.includes("401")
    || msg.includes("invalid password")
    || msg.includes("invalid email")
    || msg.includes("login failed")
  )
}

/**
 * Create markup operations using collaborator client.
 * This is HTTP-based and independent of transport.
 */
function createMarkupOps(
  url: string,
  workspace: WorkspaceUuid,
  token: string,
  collaboratorUrl: string
): MarkupOperations {
  const refUrl = concatLink(url, `/browse?workspace=${workspace}`)
  const imageUrl = concatLink(url, `/files?workspace=${workspace}&file=`)
  const collaborator = getCollaboratorClient(workspace, token, collaboratorUrl)

  return {
    async fetchMarkup(objectClass, objectId, objectAttr, doc, format) {
      const collabId = makeCollabId(objectClass, objectId, objectAttr)
      const markup = await collaborator.getMarkup(collabId, doc)
      const json = markupToJSON(markup)
      switch (format) {
        case "markup":
          return markup
        case "html":
          return jsonToHTML(json)
        case "markdown":
          return markupToMarkdown(json, { refUrl, imageUrl })
      }
    },

    async uploadMarkup(objectClass, objectId, objectAttr, value, format) {
      const collabId = makeCollabId(objectClass, objectId, objectAttr)
      switch (format) {
        case "markup":
          return await collaborator.createMarkup(collabId, value)
        case "html":
          return await collaborator.createMarkup(collabId, jsonToMarkup(htmlToJSON(value)))
        case "markdown":
          return await collaborator.createMarkup(collabId, jsonToMarkup(markdownToMarkup(value, { refUrl, imageUrl })))
      }
    }
  }
}

/**
 * Connect to Huly via REST API.
 */
const connectRest = async (
  config: ConnectionConfig
): Promise<RestConnection> => {
  // Load server configuration
  const serverConfig = await loadServerConfig(config.url)

  // Get workspace token via account service
  const { endpoint, token, workspaceId } = await getWorkspaceToken(
    config.url,
    {
      email: config.email,
      password: config.password,
      workspace: config.workspace
    },
    serverConfig
  )

  // Create REST-based TxOperations
  const client = await createRestTxOperations(endpoint, workspaceId, token)

  // Create markup operations using collaborator client
  const markupOps = createMarkupOps(
    config.url,
    workspaceId,
    token,
    serverConfig.COLLABORATOR_URL
  )

  return { client, markupOps }
}

/**
 * Connect to Huly with retry policy.
 * Retries on transient connection errors, fails fast on auth errors.
 */
const connectRestWithRetry = (
  config: ConnectionConfig
): Effect.Effect<RestConnection, HulyClientError> => {
  const attemptConnect: Effect.Effect<RestConnection, HulyClientError> = Effect.tryPromise({
    try: () => connectRest(config),
    catch: (e) => {
      if (isAuthError(e)) {
        return new HulyAuthError({
          message: `Authentication failed: ${String(e)}`
        })
      }
      return new HulyConnectionError({
        message: `Connection failed: ${String(e)}`,
        cause: e
      })
    }
  })

  // Retry policy: 3 attempts with exponential backoff
  // Don't retry auth errors (they won't succeed on retry)
  const retrySchedule = Schedule.exponential("100 millis").pipe(
    Schedule.compose(Schedule.recurs(2)) // 3 total attempts
  )

  return attemptConnect.pipe(
    Effect.retry({
      schedule: retrySchedule,
      while: (e) => !(e instanceof HulyAuthError)
    })
  )
}
