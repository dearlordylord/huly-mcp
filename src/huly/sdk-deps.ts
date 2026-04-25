import { getClient as getAccountClient } from "@hcengineering/account-client"
import {
  createRestClient,
  createRestTxOperations,
  createStorageClient,
  getWorkspaceToken,
  loadServerConfig
} from "@hcengineering/api-client"
import { getClient as getCollaboratorClient } from "@hcengineering/collaborator-client"
import { htmlToJSON, jsonToHTML, jsonToMarkup, markupToJSON } from "@hcengineering/text"
import { markdownToMarkup, markupToMarkdown } from "@hcengineering/text-markdown"
import { Context, Layer } from "effect"

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
