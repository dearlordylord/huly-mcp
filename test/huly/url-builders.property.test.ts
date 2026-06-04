import * as fc from "fast-check"
import { describe, expect, it } from "vitest"

import { DocumentId, OrganizationId, PersonId, UrlString, WorkspaceUrlSlug } from "../../src/domain/schemas/shared.js"
import { buildContactUrl, buildDocumentUrl, slugifyTitle } from "../../src/huly/url-builders.js"
import { propertyTestParameters } from "../helpers/property.js"

const nonEmptyPathSegmentArbitrary = fc.stringMatching(/^[a-z][a-z0-9-]{0,16}$/)
const hulyRefArbitrary = fc.stringMatching(/^[a-z][a-z0-9:._-]{0,24}$/)
const baseUrlArbitrary = fc.record({
  // Exclude the reserved IDNA ACE prefix "xn--": such labels are only valid when
  // they encode real punycode, so `new URL("https://xn--.example")` throws.
  host: fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/).filter((host) => !host.startsWith("xn--")),
  trailingSlashCount: fc.integer({ min: 0, max: 3 })
}).map(({ host, trailingSlashCount }) => UrlString.make(`https://${host}.example${"/".repeat(trailingSlashCount)}`))

const lowerAlphaNumArbitrary = fc.stringMatching(/^[a-z0-9]{1,8}$/)
const slugWordTitleArbitrary = fc.array(lowerAlphaNumArbitrary, { minLength: 1, maxLength: 5 }).map((words) =>
  words.join("  -  ")
)

describe("Huly URL builder properties", () => {
  it("slugifyTitle is idempotent and returns a path-safe lowercase slug", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), (title) => {
        const slug = slugifyTitle(title)

        expect(slugifyTitle(slug)).toBe(slug)
        expect(slug).toBe(slug.toLowerCase())
        expect(slug).not.toMatch(/\s/)
        expect(slug).not.toMatch(/--/)
        expect(slug).not.toMatch(/^-|-$/)
        expect(slug).toMatch(/^[a-z0-9.-]*$/)
      }),
      propertyTestParameters
    )
  })

  it("slugifyTitle preserves generated word order across whitespace and hyphen runs", () => {
    fc.assert(
      fc.property(slugWordTitleArbitrary, (title) => {
        const words = title.split("  -  ")

        expect(slugifyTitle(title)).toBe(words.join("-"))
      }),
      propertyTestParameters
    )
  })

  it("buildDocumentUrl trims base slashes and ends with the slug plus document id", () => {
    fc.assert(
      fc.property(
        baseUrlArbitrary,
        nonEmptyPathSegmentArbitrary,
        fc.string({ maxLength: 80 }),
        hulyRefArbitrary,
        (baseUrl, workspace, title, idValue) => {
          const workspaceSlug = WorkspaceUrlSlug.make(workspace)
          const documentId = DocumentId.make(idValue)
          const url = buildDocumentUrl(baseUrl, workspaceSlug, title, documentId)
          const parsed = new URL(url)
          const slug = slugifyTitle(title)
          const expectedDocumentSegment = slug === "" ? idValue : `${slug}-${idValue}`

          expect(url).not.toContain("//workbench")
          expect(parsed.pathname).toBe(`/workbench/${workspace}/document/${expectedDocumentSegment}`)
        }
      ),
      propertyTestParameters
    )
  })

  it("buildContactUrl trims base slashes and preserves person or organization ids", () => {
    fc.assert(
      fc.property(baseUrlArbitrary, nonEmptyPathSegmentArbitrary, hulyRefArbitrary, fc.boolean(), (
        baseUrl,
        workspace,
        idValue,
        isPerson
      ) => {
        const workspaceSlug = WorkspaceUrlSlug.make(workspace)
        const contactId = isPerson ? PersonId.make(idValue) : OrganizationId.make(idValue)
        const url = buildContactUrl(baseUrl, workspaceSlug, contactId)
        const parsed = new URL(url)

        expect(url).not.toContain("//workbench")
        expect(parsed.pathname).toBe(`/workbench/${workspace}/contact/${idValue}`)
      }),
      propertyTestParameters
    )
  })
})
