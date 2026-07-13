import { describe, expect, it } from "vitest"

import {
  classifyHulyUnavailableFailure,
  isDefaultHulyCloudOrigin,
  normalizeHulyOrigin
} from "../../src/huly/unavailable-diagnostics.js"

describe("unavailable Huly diagnostics", () => {
  it("normalizes an endpoint to a credential-free origin", () => {
    expect(normalizeHulyOrigin("HTTPS://user:secret@HULY.APP/path?token=leak#fragment")).toBe("https://huly.app")
    expect(isDefaultHulyCloudOrigin(normalizeHulyOrigin("https://huly.app"))).toBe(true)
    expect(isDefaultHulyCloudOrigin(normalizeHulyOrigin("https://api.huly.app"))).toBe(false)
  })

  it("classifies only allow-listed connection details", () => {
    expect(classifyHulyUnavailableFailure(Object.assign(new Error("hidden secret"), { code: "ECONNREFUSED" })))
      .toEqual(["refused", "ECONNREFUSED"])
    expect(classifyHulyUnavailableFailure(new Error("gateway returned 503 for token=secret")))
      .toEqual(["http_unavailable", undefined])
  })

  it("classifies each safe failure category without retaining backend text", () => {
    expect(classifyHulyUnavailableFailure(new Error("request timed out"))).toEqual(["timeout", undefined])
    expect(classifyHulyUnavailableFailure(new Error("TLS certificate failed"))).toEqual(["tls", undefined])
    expect(classifyHulyUnavailableFailure(new Error("getaddrinfo failed"))).toEqual(["dns", undefined])
    expect(classifyHulyUnavailableFailure(new Error("unexpected token=secret"))).toEqual(["unknown", undefined])
    expect(classifyHulyUnavailableFailure(Object.assign(new Error("hidden"), { code: "ENOTFOUND" })))
      .toEqual(["dns", "ENOTFOUND"])
    expect(classifyHulyUnavailableFailure(Object.assign(new Error("hidden"), { code: "EUNKNOWN" })))
      .toEqual(["unknown", undefined])
  })

  it("rejects empty endpoint values", () => {
    expect(() => normalizeHulyOrigin("")).toThrow()
  })
})
