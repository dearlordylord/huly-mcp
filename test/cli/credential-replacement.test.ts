import { Effect, Redacted, Result } from "effect"
import { expect, it } from "vitest"

import { saveLogin } from "../../packages/huly-cli/src/profile-operations.js"
import type { CliProfileStore } from "../../src/profiles/file-store.js"
import { CliProfileStoreError, parseProfileName, type CliProfilesFile } from "../../src/profiles/model.js"

it("preserves profile metadata and selection when credential replacement fails", async () => {
  const name = await Effect.runPromise(parseProfileName("work"))
  const active = await Effect.runPromise(parseProfileName("personal"))
  const original: CliProfilesFile = {
    version: 1,
    activeProfile: active,
    profiles: {
      [name]: { url: "https://old.example", workspace: "old" },
      [active]: { url: "https://personal.example", workspace: "personal" }
    }
  }
  let profiles = original
  const store: CliProfileStore = {
    paths: { directory: "/unused", profiles: "/unused/profiles", credentials: "/unused/credentials" },
    readProfiles: () => Effect.succeed(profiles),
    writeProfiles: (value) =>
      Effect.sync(() => {
        profiles = value
      }),
    readCredentials: () => Effect.succeed({ version: 1, tokens: {} }),
    writeCredentials: () => Effect.void
  }
  const denied = new CliProfileStoreError({ kind: "integration", message: "Credential store access denied." })
  const result = await Effect.runPromise(
    saveLogin(
      store,
      name,
      { url: "https://replacement.example", workspace: "replacement" },
      Redacted.make("replacement-sentinel"),
      () => ({ read: () => Effect.succeed(undefined), save: () => Effect.fail(denied), remove: () => Effect.void })
    ).pipe(Effect.result)
  )

  expect(Result.isFailure(result)).toBe(true)
  expect(profiles).toEqual(original)
})
