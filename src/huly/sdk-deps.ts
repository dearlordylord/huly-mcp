import { Context, Layer } from "effect"
import { markdownToMarkup, markupToMarkdown } from "./huly-text-markdown.js"
import { htmlToJSON, jsonToHTML, jsonToMarkup, markupToJSON } from "./huly-text.js"

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports, no-restricted-syntax -- CJS interop boundary mirrors huly-plugins.ts */

const accountClient = require("@hcengineering/account-client") as typeof import("@hcengineering/account-client")
const apiClient = require("@hcengineering/api-client") as typeof import("@hcengineering/api-client")
const collaboratorClient = require(
  "@hcengineering/collaborator-client"
) as typeof import("@hcengineering/collaborator-client")

/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/consistent-type-imports, no-restricted-syntax */

const createRestClient = apiClient.createRestClient
const createRestTxOperations = apiClient.createRestTxOperations
const createStorageClient = apiClient.createStorageClient
const getAccountClient = accountClient.getClient
const getCollaboratorClient = collaboratorClient.getClient
const getWorkspaceToken = apiClient.getWorkspaceToken
const loadServerConfig = apiClient.loadServerConfig

export interface HulySdkDependencies {
  readonly createRestClient: typeof createRestClient
  readonly createRestTxOperations: typeof createRestTxOperations
  readonly createStorageClient: typeof createStorageClient
  readonly getAccountClient: typeof getAccountClient
  readonly getCollaboratorClient: typeof getCollaboratorClient
  readonly getWorkspaceToken: typeof getWorkspaceToken
  readonly htmlToJSON: typeof htmlToJSON
  readonly jsonToHTML: typeof jsonToHTML
  readonly jsonToMarkup: typeof jsonToMarkup
  readonly loadServerConfig: typeof loadServerConfig
  readonly markdownToMarkup: typeof markdownToMarkup
  readonly markupToJSON: typeof markupToJSON
  readonly markupToMarkdown: typeof markupToMarkdown
}

export class HulySdk extends Context.Tag("@hulymcp/HulySdk")<
  HulySdk,
  HulySdkDependencies
>() {
  static readonly defaultLayer: Layer.Layer<HulySdk> = Layer.succeed(HulySdk, {
    createRestClient,
    createRestTxOperations,
    createStorageClient,
    getAccountClient,
    getCollaboratorClient,
    getWorkspaceToken,
    htmlToJSON,
    jsonToHTML,
    jsonToMarkup,
    loadServerConfig,
    markdownToMarkup,
    markupToJSON,
    markupToMarkdown
  })
}
