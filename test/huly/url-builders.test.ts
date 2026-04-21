import { describe, expect, it } from "vitest"

import { buildDocumentUrl, slugifyTitle } from "../../src/huly/url-builders.js"

describe("slugifyTitle", () => {
  it("reproduces the known Huly slug for a real document title", () => {
    expect(slugifyTitle("v1.0a Short-Circuit Analysis - Lite/Keel Variants"))
      .toBe("v1.0a-short-circuit-analysis-litekeel-variants")
  })

  it("lowercases", () => {
    expect(slugifyTitle("Hello")).toBe("hello")
  })

  it("preserves dots and hyphens", () => {
    expect(slugifyTitle("v1.0-beta")).toBe("v1.0-beta")
  })

  it("strips slashes without inserting a separator", () => {
    expect(slugifyTitle("foo/bar")).toBe("foobar")
  })

  it("collapses whitespace runs to a single hyphen", () => {
    expect(slugifyTitle("a   b\tc")).toBe("a-b-c")
  })

  it("collapses consecutive hyphens from ' - ' patterns", () => {
    expect(slugifyTitle("foo - bar")).toBe("foo-bar")
  })

  it("strips punctuation other than dot and hyphen", () => {
    expect(slugifyTitle("Hello, World! (draft)")).toBe("hello-world-draft")
  })

  it("trims leading and trailing hyphens", () => {
    expect(slugifyTitle("  -foo-  ")).toBe("foo")
  })

  it("returns empty string for all-stripped titles", () => {
    expect(slugifyTitle("!!!")).toBe("")
    expect(slugifyTitle("")).toBe("")
  })
})

describe("buildDocumentUrl", () => {
  const baseUrl = "https://huly.axzez.org"
  const workspaceUuid = "axzez-6925fc59-8ee2eba17e-eb022e"
  const id = "69e6a5dab299f79d42314f12"

  it("reproduces the canonical working URL", () => {
    expect(buildDocumentUrl(
      baseUrl,
      workspaceUuid,
      "v1.0a Short-Circuit Analysis - Lite/Keel Variants",
      id
    )).toBe(
      "https://huly.axzez.org/workbench/axzez-6925fc59-8ee2eba17e-eb022e/document/v1.0a-short-circuit-analysis-litekeel-variants-69e6a5dab299f79d42314f12"
    )
  })

  it("tolerates trailing slash on baseUrl", () => {
    expect(buildDocumentUrl(`${baseUrl}/`, workspaceUuid, "Test", id))
      .toBe(`${baseUrl}/workbench/${workspaceUuid}/document/test-${id}`)
  })

  it("falls back to bare id when slug is empty", () => {
    expect(buildDocumentUrl(baseUrl, workspaceUuid, "!!!", id))
      .toBe(`${baseUrl}/workbench/${workspaceUuid}/document/${id}`)
  })
})
