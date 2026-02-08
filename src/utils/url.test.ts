import { describe, expect, it } from "vitest"

import { concatLink } from "./url.js"

describe("concatLink", () => {
  describe("slash handling", () => {
    // test-revizorro: approved
    it("host with trailing slash, path with leading slash", () => {
      expect(concatLink("https://example.com/", "/files")).toBe("https://example.com/files")
    })

    // test-revizorro: approved
    it("host without trailing slash, path without leading slash", () => {
      expect(concatLink("https://example.com", "files")).toBe("https://example.com/files")
    })

    // test-revizorro: suspect | duplicate of line 12-15 test with identical inputs/outputs
    it("both without slashes", () => {
      expect(concatLink("https://example.com", "files")).toBe("https://example.com/files")
    })

    // test-revizorro: approved
    it("host without trailing slash, path with leading slash", () => {
      expect(concatLink("https://example.com", "/files")).toBe("https://example.com/files")
    })
  })

  describe("codebase usage patterns", () => {
    // test-revizorro: approved
    it("concatLink(url, '/files')", () => {
      expect(concatLink("https://huly.io", "/files")).toBe("https://huly.io/files")
    })

    // test-revizorro: approved
    it("concatLink(url, '/browse?workspace=xyz')", () => {
      expect(concatLink("https://huly.io", "/browse?workspace=xyz")).toBe(
        "https://huly.io/browse?workspace=xyz"
      )
    })

    // test-revizorro: approved
    it("concatLink(url, serverConfig.UPLOAD_URL ?? '/upload') with default", () => {
      expect(concatLink("https://huly.io", "/upload")).toBe("https://huly.io/upload")
    })

    // test-revizorro: approved
    it("concatLink(url, serverConfig.UPLOAD_URL ?? '/upload') with custom path", () => {
      expect(concatLink("https://huly.io", "/custom-upload")).toBe("https://huly.io/custom-upload")
    })

    // test-revizorro: approved
    it("concatLink(url, '/files?workspace=ws&file=')", () => {
      expect(concatLink("https://huly.io", "/files?workspace=ws&file=")).toBe(
        "https://huly.io/files?workspace=ws&file="
      )
    })
  })

  describe("host with path prefix", () => {
    // test-revizorro: scheduled
    it("host with path, path with leading slash", () => {
      expect(concatLink("https://example.com/api", "/files")).toBe("https://example.com/api/files")
    })

    // test-revizorro: scheduled
    it("host with trailing-slashed path, path with leading slash", () => {
      expect(concatLink("https://example.com/api/", "/files")).toBe(
        "https://example.com/api/files"
      )
    })
  })
})
