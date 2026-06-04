import { describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"
import { getHulyContextResultJsonSchema, GetHulyContextResultSchema } from "../../src/domain/schemas/index.js"

const validContext = {
  package: {
    name: "@firfi/huly-mcp",
    version: "0.15.0"
  },
  transport: {
    type: "http",
    http: {
      host: "127.0.0.1",
      port: 3000
    }
  },
  huly: {
    url: {
      configured: true,
      valid: true,
      origin: "https://example.huly.app",
      host: "example.huly.app",
      protocol: "https:"
    },
    workspace: {
      configured: true,
      value: "workspace"
    },
    connectionTimeout: {
      configured: true,
      valid: true,
      valueMs: 30000,
      defaultMs: 30000,
      source: "env"
    }
  },
  auth: {
    method: "token",
    source: "env",
    tokenConfigured: true,
    emailConfigured: false,
    passwordConfigured: false
  },
  configSources: {
    env: {
      hulyUrl: true,
      hulyWorkspace: true,
      hulyToken: true,
      hulyEmail: false,
      hulyPassword: false,
      hulyConnectionTimeout: true,
      lazyEnvs: false
    },
    headers: {
      present: false,
      requiredComplete: false,
      hulyUrl: false,
      hulyWorkspace: false,
      hulyToken: false,
      hulyConnectionTimeout: false,
      unsupportedHulyHeaders: []
    }
  },
  toolsets: {
    filteringActive: true,
    requestedCategories: ["issues"],
    enabledCategories: ["issues"],
    ignoredCategories: [],
    availableCategories: ["issues", "projects"],
    visibleRegisteredToolCount: 12,
    totalRegisteredToolCount: 120,
    builtinTools: ["get_version", "get_huly_context"]
  }
}

describe("GetHulyContextResultSchema", () => {
  it.effect("accepts a full valid context result", () =>
    Effect.gen(function*() {
      const decoded = Schema.decodeUnknownSync(GetHulyContextResultSchema)(validContext)
      expect(decoded.package.name).toBe("@firfi/huly-mcp")
      expect(decoded.transport.type).toBe("http")
      expect(decoded.toolsets.builtinTools).toEqual(["get_version", "get_huly_context"])
    }))

  it.effect("rejects non-sanitized URL origin values", () =>
    Effect.gen(function*() {
      expect(() =>
        Schema.decodeUnknownSync(GetHulyContextResultSchema)({
          ...validContext,
          huly: {
            ...validContext.huly,
            url: {
              ...validContext.huly.url,
              origin: "https://example.huly.app/path?token=secret"
            }
          }
        })
      ).toThrow()
    }))

  it.effect("rejects an origin that is not a parseable URL", () =>
    Effect.gen(function*() {
      // A non-empty string that throws in `new URL(...)` exercises the catch arm.
      expect(() =>
        Schema.decodeUnknownSync(GetHulyContextResultSchema)({
          ...validContext,
          huly: {
            ...validContext.huly,
            url: {
              ...validContext.huly.url,
              origin: "not-a-valid-url"
            }
          }
        })
      ).toThrow()
    }))

  it.effect("rejects empty diagnostic strings", () =>
    Effect.gen(function*() {
      for (
        const context of [
          { ...validContext, package: { ...validContext.package, version: "" } },
          {
            ...validContext,
            transport: { ...validContext.transport, http: { ...validContext.transport.http, host: "" } }
          },
          {
            ...validContext,
            huly: {
              ...validContext.huly,
              workspace: { configured: true, value: "" }
            }
          },
          {
            ...validContext,
            toolsets: {
              ...validContext.toolsets,
              requestedCategories: [""]
            }
          }
        ]
      ) {
        expect(() => Schema.decodeUnknownSync(GetHulyContextResultSchema)(context)).toThrow()
      }
    }))

  it.effect("JSON schema exposes core top-level fields", () =>
    Effect.gen(function*() {
      expect(getHulyContextResultJsonSchema).toMatchObject({
        type: "object",
        properties: {
          package: expect.any(Object),
          transport: expect.any(Object),
          huly: expect.any(Object),
          auth: expect.any(Object),
          configSources: expect.any(Object),
          toolsets: expect.any(Object)
        }
      })
    }))
})
