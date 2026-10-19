import { type AuthOptions, type MarkupFormat, type MarkupRef } from "@hcengineering/api-client"
import {
  type AccountUuid,
  type Class,
  type Doc,
  makeCollabId,
  type PersonId,
  type Ref,
  type TxOperations,
  type WorkspaceUuid
} from "@hcengineering/core"
import { absurd, Effect, Redacted, Schedule, type Scope } from "effect"
import { type Auth } from "../config/config.js"

import { UrlString, WorkspaceUrlSlug } from "../domain/schemas/shared.js"
import { concatLink } from "../utils/url.js"
import { HulyAuthError, type HulyConnectionError, HulyUnavailableError } from "./errors-base.js"

import { PlatformError } from "./huly-platform.js"
import {
  markdownInputUrlConfig,
  markupNodeToMarkdownString,
  type MarkupUrlConfig,
  transformMarkupNodeNativeReferenceLinks
} from "./operations/markup.js"

import { type HulySdkDependencies } from "./sdk-deps.js"
import { parseCollaboratorEndpoint } from "./collaborator-endpoint.js"

import { classifyHulyUnavailableFailure, normalizeHulyOrigin } from "./unavailable-diagnostics.js"

import { type MovementTransportConfig } from "./movement-transaction-transport.js"
import { acquirePendingClosableClient } from "./scoped-client.js"
import { parseMovementTransportConfig } from "./movement-write-client.js"

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

export const withConnectionRetry = <A, R>(
  attempt: Effect.Effect<A, ConnectionError, R>
): Effect.Effect<A, ConnectionError, R> =>
  attempt.pipe(
    Effect.retry({
      schedule: connectionRetrySchedule,
      times: MAX_RETRIES,
      while: (e) => e instanceof HulyUnavailableError
    })
  )

const parseConnectionFailure = (error: unknown, endpointUrl: string): HulyAuthError | HulyUnavailableError => {
  if (isAuthError(error)) return new HulyAuthError({ message: "Credentials or workspace authorization failed" })
  const [failureKind, detailCode] = classifyHulyUnavailableFailure(error)
  const endpointOrigin = normalizeHulyOrigin(endpointUrl)
  return new HulyUnavailableError({ endpointOrigin, failureKind, ...(detailCode === undefined ? {} : { detailCode }) })
}

export const connectionAttempt = <A>(
  connect: () => Promise<A>,
  endpointUrl: string
): Effect.Effect<A, HulyAuthError | HulyUnavailableError> =>
  Effect.tryPromise({ try: connect, catch: (e) => parseConnectionFailure(e, endpointUrl) })

export const connectWithRetry = <A>(
  connect: () => Promise<A>,
  endpointUrl: string
): Effect.Effect<A, ConnectionError> => withConnectionRetry(connectionAttempt(connect, endpointUrl))

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

export interface RestConnection {
  movementTransportConfig: MovementTransportConfig
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

export const connectRestTransport = (
  config: ConnectionConfig,
  sdk: HulySdkDependencies,
  timeoutMs: MovementTransportConfig["timeoutMs"]
): Effect.Effect<RestTransport, ConnectionError> =>
  Effect.gen(function* () {
    const discovery = yield* connectionAttempt(async () => {
      const serverConfig = await sdk.loadServerConfig(config.url)
      const selected = await sdk.getWorkspaceToken(
        config.url,
        authToOptions(config.auth, config.workspace),
        serverConfig
      )
      return { serverConfig, ...selected }
    }, config.url)
    const { endpoint, info, token, workspaceId } = discovery
    const movementTransportConfig = yield* parseMovementTransportConfig({
      endpoint,
      workspace: workspaceId,
      token: Redacted.make(token),
      timeoutMs
    })
    const collaboratorEndpoint = yield* parseCollaboratorEndpoint(discovery.serverConfig, info)

    return yield* connectionAttempt(async () => {
      // createRestTxOperations also calls getAccount() internally but doesn't expose it.
      // Extra call here is one-time at connection startup; acceptable to avoid reimplementing SDK internals.
      const restClient = sdk.createRestClient(endpoint, workspaceId, token)
      const account = await restClient.getAccount()

      const createFullClient = () =>
        sdk.createRestTxOperations(endpoint, workspaceId, token, LOAD_FULL_MODEL_FOR_AUTHORITATIVE_METADATA)
      let context: Omit<RestConnection, "client"> | undefined
      return {
        createFullClient,
        projectClient: restClient,
        complete: () => {
          if (context !== undefined) return context
          const {
            imageUrl,
            ops: markupOps,
            refUrl
          } = createMarkupOps(config.url, workspaceId, token, collaboratorEndpoint.href, sdk)

          context = {
            movementTransportConfig,
            accountUuid: account.uuid,
            primarySocialId: account.primarySocialId,
            socialIds: account.socialIds,
            workspaceUrlSlug: WorkspaceUrlSlug.make(info.workspaceUrl),
            markupOps,
            refUrl,
            imageUrl
          }
          return context
        }
      }
    }, config.url)
  })

interface RestTransport {
  readonly projectClient: ReturnType<HulySdkDependencies["createRestClient"]>
  readonly createFullClient: () => Promise<TxOperations>
  readonly complete: () => Omit<RestConnection, "client">
}
export const connectRestWithRetry = (
  config: ConnectionConfig,
  sdk: HulySdkDependencies,
  timeoutMs: MovementTransportConfig["timeoutMs"],
  initial?: RestTransport,
  onTransport?: (transport: RestTransport) => void,
  ownership: "caller" | "scope" = "caller"
): Effect.Effect<RestConnection, ConnectionError, Scope.Scope> => {
  let first = initial
  return Effect.suspend(() => {
    const selected = first
    first = undefined
    return (selected === undefined ? connectRestTransport(config, sdk, timeoutMs) : Effect.succeed(selected)).pipe(
      Effect.tap((transport) => Effect.sync(() => onTransport?.(transport))),
      Effect.flatMap((transport) => {
        const create = async () => {
          const client = await transport.createFullClient()
          try {
            return { ...transport.complete(), client }
          } catch (error) {
            await client.close()
            throw error
          }
        }
        return ownership === "scope"
          ? acquirePendingClosableClient(create).pipe(
              Effect.mapError((error) => parseConnectionFailure(error, config.url))
            )
          : connectionAttempt(create, config.url)
      })
    )
  }).pipe(withConnectionRetry)
}
