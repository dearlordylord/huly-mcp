import { describe, expect, it } from "vitest"

import {
  classifyEndpointKind,
  classifyHulyUnavailableFailure,
  normalizeHulyOrigin
} from "../../src/huly/unavailable-diagnostics.js"

describe("unavailable Huly diagnostics", () => {
  it("normalizes an endpoint to a credential-free origin", () => {
    expect(normalizeHulyOrigin("HTTPS://user:secret@HULY.APP/path?token=leak#fragment")).toBe("https://huly.app")
    expect(classifyEndpointKind("https://huly.app")).toBe("default_cloud")
    expect(classifyEndpointKind("https://api.huly.app")).toBe("custom")
  })

  it("classifies only allow-listed connection details", () => {
    expect(classifyHulyUnavailableFailure(Object.assign(new Error("hidden secret"), { code: "ECONNREFUSED" })))
      .toEqual(["refused", "ECONNREFUSED"])
    expect(classifyHulyUnavailableFailure(new Error("gateway returned 503 for token=secret")))
      .toEqual(["http_unavailable", undefined])
  })
})
