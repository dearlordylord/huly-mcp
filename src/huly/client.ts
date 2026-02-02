/**
 * HulyClient service for Huly MCP server.
 *
 * Provides authenticated connection to Huly platform with:
 * - Eager connection (connects when layer is built)
 * - Graceful shutdown (closes on scope finalization)
 * - Retry on connection failures
 * - Error mapping to HulyConnectionError/HulyAuthError
 *
 * @module
 */
import {
  connect,
  NodeWebSocketFactory,
  type PlatformClient,
} from "@hcengineering/api-client"
import type {
  AttachedData,
  AttachedDoc,
  Class,
  Data,
  Doc,
  DocumentQuery,
  DocumentUpdate,
  FindOptions,
  FindResult,
  Ref,
  Space,
  TxResult,
  WithLookup,
} from "@hcengineering/core"
import type { MarkupFormat, MarkupRef } from "@hcengineering/api-client"
import { Context, Effect, Layer, Redacted, Schedule } from "effect"
import { HulyAuthError, HulyConnectionError } from "./errors.js"
import { HulyConfigService } from "../config/config.js"

// --- Error Type ---

/**
 * Union of errors that HulyClient operations can produce.
 */
export type HulyClientError = HulyConnectionError | HulyAuthError

// --- HulyClient Service Interface ---

/**
 * Operations exposed by the HulyClient service.
 * Wraps PlatformClient methods with Effect error handling.
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
   * Production layer - connects to Huly platform.
   * Connection is eager (on layer build) for simpler lifecycle.
   * Handles graceful shutdown on scope finalization.
   */
  static readonly layer: Layer.Layer<
    HulyClient,
    HulyClientError,
    HulyConfigService
  > = Layer.scoped(
    HulyClient,
    Effect.gen(function* () {
      const config = yield* HulyConfigService

      // Eager connection - connect immediately when layer is built
      const client = yield* connectWithRetry({
        url: config.url,
        email: config.email,
        password: Redacted.value(config.password),
        workspace: config.workspace,
        connectionTimeout: config.connectionTimeout,
      })

      // Register cleanup on scope finalization
      yield* Effect.addFinalizer(() =>
        Effect.promise(() => client.close()).pipe(
          Effect.catchAll(() => Effect.void)
        )
      )

      // Helper to wrap operations with the connected client
      const withClient = <A>(
        op: (client: PlatformClient) => Promise<A>,
        errorMsg: string
      ): Effect.Effect<A, HulyClientError> =>
        Effect.tryPromise({
          try: () => op(client),
          catch: (e) =>
            new HulyConnectionError({
              message: `${errorMsg}: ${String(e)}`,
              cause: e as Error,
            }),
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
            (client) =>
              client.createDoc(
                _class,
                space,
                attributes as Parameters<typeof client.createDoc>[2],
                id
              ),
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
            (client) =>
              client.updateDoc(
                _class,
                space,
                objectId,
                ops as Parameters<typeof client.updateDoc>[3],
                retrieve
              ),
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
                attributes as Parameters<typeof client.addCollection>[5],
                id
              ),
            "addCollection failed"
          ) as Effect.Effect<Ref<P>, HulyClientError>,

        uploadMarkup: (objectClass, objectId, objectAttr, markup, format) =>
          withClient(
            (client) =>
              client.uploadMarkup(objectClass, objectId, objectAttr, markup, format),
            "uploadMarkup failed"
          ),

        fetchMarkup: (objectClass, objectId, objectAttr, id, format) =>
          withClient(
            (client) =>
              client.fetchMarkup(objectClass, objectId, objectAttr, id, format),
            "fetchMarkup failed"
          ),
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
    > => Effect.succeed([] as unknown as FindResult<T>)

    const noopFindOne = <T extends Doc>(): Effect.Effect<
      WithLookup<T> | undefined,
      HulyClientError
    > => Effect.succeed(undefined)

    const noopCreateDoc = <T extends Doc>(): Effect.Effect<
      Ref<T>,
      HulyClientError
    > => Effect.succeed("" as Ref<T>)

    const noopUpdateDoc = (): Effect.Effect<TxResult, HulyClientError> =>
      Effect.succeed({} as TxResult)

    const noopAddCollection = <
      _T extends Doc,
      P extends AttachedDoc,
    >(): Effect.Effect<Ref<P>, HulyClientError> =>
      Effect.succeed("" as Ref<P>)

    const noopUploadMarkup = (): Effect.Effect<MarkupRef, HulyClientError> =>
      Effect.succeed("" as MarkupRef)

    const noopFetchMarkup = (): Effect.Effect<string, HulyClientError> =>
      Effect.succeed("")

    const defaultOps: HulyClientOperations = {
      findAll: noopFindAll,
      findOne: noopFindOne,
      createDoc: noopCreateDoc,
      updateDoc: noopUpdateDoc,
      addCollection: noopAddCollection,
      uploadMarkup: noopUploadMarkup,
      fetchMarkup: noopFetchMarkup,
    }

    return Layer.succeed(HulyClient, { ...defaultOps, ...mockOperations })
  }
}

// --- Internal Functions ---

/**
 * Connection config for internal use.
 */
interface ConnectionConfig {
  url: string
  email: string
  password: string
  workspace: string
  connectionTimeout: number
}

/**
 * Check if error looks like an auth error.
 */
const isAuthError = (error: unknown): boolean => {
  const msg = String(error).toLowerCase()
  return (
    msg.includes("unauthorized") ||
    msg.includes("authentication") ||
    msg.includes("auth") ||
    msg.includes("credentials") ||
    msg.includes("401") ||
    msg.includes("invalid password") ||
    msg.includes("invalid email")
  )
}

/**
 * Connect to Huly with retry policy.
 * Retries on transient connection errors, fails fast on auth errors.
 */
const connectWithRetry = (
  config: ConnectionConfig
): Effect.Effect<PlatformClient, HulyClientError> => {
  const attemptConnect: Effect.Effect<PlatformClient, HulyClientError> =
    Effect.tryPromise({
      try: () =>
        connect(config.url, {
          email: config.email,
          password: config.password,
          workspace: config.workspace,
          socketFactory: NodeWebSocketFactory,
          connectionTimeout: config.connectionTimeout,
        }),
      catch: (e) => {
        if (isAuthError(e)) {
          return new HulyAuthError({
            message: `Authentication failed: ${String(e)}`,
          })
        }
        return new HulyConnectionError({
          message: `Connection failed: ${String(e)}`,
          cause: e as Error,
        })
      },
    })

  // Retry policy: 3 attempts with exponential backoff
  // Don't retry auth errors (they won't succeed on retry)
  const retrySchedule = Schedule.exponential("100 millis").pipe(
    Schedule.compose(Schedule.recurs(2)) // 3 total attempts
  )

  return attemptConnect.pipe(
    Effect.retry({
      schedule: retrySchedule,
      while: (e) => !(e instanceof HulyAuthError),
    })
  )
}
