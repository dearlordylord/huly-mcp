import { describe, it } from "@effect/vitest"
import { Effect, Result } from "effect"
import { expect } from "vitest"
import { parseCollaboratorEndpoint } from "../../src/huly/collaborator-endpoint.js"

describe("collaborator endpoint discovery", () => {
  it.effect("uses workspace discovery without a global endpoint", () =>
    Effect.gen(function* () {
      const endpoint = yield* parseCollaboratorEndpoint({}, { collaboratorEndpoint: "ws://intabia.test/_collaborator" })
      expect(endpoint.href).toBe("ws://intabia.test/_collaborator")
    })
  )

  it.effect("prefers the selected workspace endpoint over global configuration", () =>
    Effect.gen(function* () {
      const endpoint = yield* parseCollaboratorEndpoint(
        { COLLABORATOR_URL: "https://global.test/collaborator" },
        { collaboratorEndpoint: "wss://workspace.test/collaborator" }
      )
      expect(endpoint.href).toBe("wss://workspace.test/collaborator")
    })
  )

  it.effect("preserves Huly global discovery when workspace discovery is absent or null", () =>
    Effect.gen(function* () {
      for (const workspace of [{}, { collaboratorEndpoint: null }, { collaboratorEndpoint: undefined }]) {
        const endpoint = yield* parseCollaboratorEndpoint(
          { COLLABORATOR_URL: "http://huly.test/collaborator" },
          workspace
        )
        expect(endpoint.href).toBe("http://huly.test/collaborator")
      }
    })
  )

  it.effect("rejects missing, malformed and unsupported endpoints without disclosing payloads", () =>
    Effect.gen(function* () {
      for (const candidate of [undefined, null, "", "/relative", "file:///secret", 42, "bad-secret-value"]) {
        const result = yield* Effect.result(parseCollaboratorEndpoint({}, { collaboratorEndpoint: candidate }))
        expect(Result.isFailure(result)).toBe(true)
        if (Result.isFailure(result)) {
          expect(result.failure._tag).toBe("HulyConnectionError")
          expect(result.failure.message).toContain("Invalid collaborator endpoint")
          expect(JSON.stringify(result.failure)).not.toContain("secret")
          expect(result.failure.cause).toBeUndefined()
        }
      }
    })
  )

  it.effect("rejects a malformed discovery envelope", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(parseCollaboratorEndpoint(null, {}))
      expect(Result.isFailure(result)).toBe(true)
    })
  )

  it.effect("does not send a workspace token to the global endpoint after invalid workspace discovery", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        parseCollaboratorEndpoint(
          { COLLABORATOR_URL: "https://global.test/collaborator" },
          { collaboratorEndpoint: "invalid" }
        )
      )
      expect(Result.isFailure(result)).toBe(true)
    })
  )
})
