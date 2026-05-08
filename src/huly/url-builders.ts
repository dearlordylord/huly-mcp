/**
 * URL builders for Huly web-app links.
 *
 * Routes:
 *   document: <baseUrl>/workbench/<workspaceUrlSlug>/document/<title-slug>-<id>
 *   contact:  <baseUrl>/workbench/<workspaceUrlSlug>/contact/<id>
 *
 * `workspaceUrlSlug` comes from `WorkspaceLoginInfo.workspaceUrl` on the
 * account-client (not the `WorkspaceUuid` — that's a different identifier and
 * loops back to the login screen when used in URLs).
 *
 * The contact path segment is the workbench application alias registered in
 * upstream platform; see
 * https://github.com/hcengineering/platform/blob/3d469f0109ae0f8efd3f1b7efd6ca7ab141c8202/models/contact/src/index.ts#L448
 * (`alias: contactId`, where `contactId === "contact"`).
 *
 * @module
 */
import type { DocumentId, OrganizationId, PersonId, WorkspaceUrlSlug } from "../domain/schemas/shared.js"
import { UrlString } from "../domain/schemas/shared.js"

export interface DocumentUrlConfig {
  readonly baseUrl: UrlString
  readonly workspaceUrlSlug: WorkspaceUrlSlug
}

/**
 * Slugify a document title to match Huly's URL path segment.
 *
 * Algorithm (reverse-engineered from live URLs; no upstream helper is exposed
 * by @hcengineering/document):
 *   1. lowercase
 *   2. strip characters outside [a-z 0-9 . - whitespace]
 *   3. replace whitespace runs with a single hyphen
 *   4. collapse consecutive hyphens
 *   5. trim leading/trailing hyphens
 *
 * Returns "" for titles that reduce to only stripped characters; the caller
 * falls back to the bare id in that case.
 */
export const slugifyTitle = (title: string): string => {
  const lowered = title.toLowerCase()
  const stripped = lowered.replace(/[^a-z0-9.\-\s]/g, "")
  const hyphenated = stripped.replace(/\s+/g, "-")
  const collapsed = hyphenated.replace(/-+/g, "-")
  return collapsed.replace(/^-+|-+$/g, "")
}

/**
 * Build a Huly web-app URL for a document. Trailing slashes on `baseUrl` are
 * tolerated. See {@link slugifyTitle} for the path-segment algorithm.
 */
export const buildDocumentUrl = (
  baseUrl: UrlString,
  workspaceUrlSlug: WorkspaceUrlSlug,
  title: string,
  id: DocumentId
): UrlString => {
  const trimmedBase = baseUrl.replace(/\/+$/, "")
  const slug = slugifyTitle(title)
  const pathSegment = slug === "" ? id : `${slug}-${id}`
  return UrlString.make(`${trimmedBase}/workbench/${workspaceUrlSlug}/document/${pathSegment}`)
}

export const buildDocumentUrlFromConfig = (config: DocumentUrlConfig, title: string, id: DocumentId): UrlString =>
  buildDocumentUrl(config.baseUrl, config.workspaceUrlSlug, title, id)

/**
 * Build a Huly web-app URL for a person or organization. Trailing slashes on
 * `baseUrl` are tolerated.
 */
export const buildContactUrl = (
  baseUrl: UrlString,
  workspaceUrlSlug: WorkspaceUrlSlug,
  id: OrganizationId | PersonId
): UrlString => {
  const trimmedBase = baseUrl.replace(/\/+$/, "")
  return UrlString.make(`${trimmedBase}/workbench/${workspaceUrlSlug}/contact/${id}`)
}

export const buildContactUrlFromConfig = (
  config: DocumentUrlConfig,
  id: OrganizationId | PersonId
): UrlString => buildContactUrl(config.baseUrl, config.workspaceUrlSlug, id)
