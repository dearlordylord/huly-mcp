import { JSONSchema, Schema } from "effect"

import { DocumentIdentifier, IssueIdentifier, ProjectIdentifier, TeamspaceIdentifier } from "./shared.js"

const docRelationFields = {
  project: ProjectIdentifier.annotations({
    description: "Project identifier of the issue (e.g., 'HULY')"
  }),
  issueIdentifier: IssueIdentifier.annotations({
    description: "Issue identifier (e.g., 'HULY-123')"
  }),
  teamspace: TeamspaceIdentifier.annotations({
    description: "Teamspace containing the document (name or ID)"
  }),
  document: DocumentIdentifier.annotations({
    description: "Document to link (title or ID)"
  })
}

export const LinkDocumentToIssueParamsSchema = Schema.Struct(docRelationFields).annotations({
  title: "LinkDocumentToIssueParams",
  description: "Parameters for linking a document to an issue"
})

export type LinkDocumentToIssueParams = Schema.Schema.Type<typeof LinkDocumentToIssueParamsSchema>

export const UnlinkDocumentFromIssueParamsSchema = Schema.Struct(docRelationFields).annotations({
  title: "UnlinkDocumentFromIssueParams",
  description: "Parameters for unlinking a document from an issue"
})

export type UnlinkDocumentFromIssueParams = Schema.Schema.Type<typeof UnlinkDocumentFromIssueParamsSchema>

export const linkDocumentToIssueParamsJsonSchema = JSONSchema.make(LinkDocumentToIssueParamsSchema)
export const unlinkDocumentFromIssueParamsJsonSchema = JSONSchema.make(UnlinkDocumentFromIssueParamsSchema)

export const parseLinkDocumentToIssueParams = Schema.decodeUnknown(LinkDocumentToIssueParamsSchema)
export const parseUnlinkDocumentFromIssueParams = Schema.decodeUnknown(UnlinkDocumentFromIssueParamsSchema)

export interface LinkDocumentToIssueResult {
  readonly issue: string
  readonly document: string
  readonly documentTitle: string
  readonly linked: boolean
}

export interface UnlinkDocumentFromIssueResult {
  readonly issue: string
  readonly document: string
  readonly documentTitle: string
  readonly unlinked: boolean
}
