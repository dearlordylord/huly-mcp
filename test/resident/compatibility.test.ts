import { it } from "@effect/vitest"
import { Effect, Exit, Fiber, Redacted, Schema, Scope } from "effect"
import { TestClock } from "effect/testing"
import { expect } from "vitest"

import {
  CompatibilityNonce,
  MAX_COMPATIBILITY_CHALLENGES,
  ResidentSelection
} from "../../src/resident/compatibility-contract.js"
import { makeCompatibilityAuthority } from "../../src/resident/compatibility-authority.js"
import { encodeCompatibilitySelection, makeCompatibilityProof } from "../../src/resident/compatibility-crypto.js"
import { ResidentTlsIdentity } from "../../src/resident/tls-channel.js"

type SelectionInput = Schema.Codec.Encoded<typeof ResidentSelection>
const selection = (
  huly: Partial<SelectionInput["huly"]> = {},
  policy: Partial<SelectionInput["policy"]> = {},
  lazyEnvs = false
) =>
  Schema.decodeUnknownSync(ResidentSelection)({
    huly: {
      url: "https://huly.invalid",
      workspace: "first",
      auth: { _tag: "token", token: "fixture-token" },
      connectionTimeout: 1_000,
      ...huly
    },
    policy: { toolsets: [], tools: [], exposure: { configuredMode: "auto", proxyOutputStrict: false }, ...policy },
    lazyEnvs,
    telemetryEnabled: true
  })
const generation = ResidentTlsIdentity.fields.generation.make("32300000-0000-4000-8000-000000000001")
const otherGeneration = ResidentTlsIdentity.fields.generation.make("32300000-0000-4000-8000-000000000002")
const authorization = Redacted.make("private-daemon-fixture-authorization")

it.effect("accepts exact parsed authority once and rejects proof replay", () =>
  Effect.gen(function* () {
    const owner = yield* makeCompatibilityAuthority(selection(), generation, authorization)
    const challenge = yield* owner.challenge
    const proof = yield* makeCompatibilityProof(selection(), challenge, authorization)
    yield* owner.verify(proof)
    const replay = yield* Effect.flip(owner.verify(proof))
    expect(replay.kind).toBe("unknown")
  }).pipe(Effect.scoped)
)

it.effect("preserves password bytes and has fixed tuple ordering independent of object insertion order", () =>
  Effect.gen(function* () {
    const selected = selection(
      {
        url: "https://User:Pass@HULY.invalid/",
        workspace: " workspace ",
        auth: { _tag: "password", email: " email ", password: ' \u00e9\\"\n ' }
      },
      { toolsets: ["issues", "projects"], tools: ["get_issue"] }
    )
    const encoded = yield* encodeCompatibilitySelection(selected)
    expect(Redacted.value(encoded)).toBe(
      JSON.stringify([
        "https://User:Pass@HULY.invalid/",
        " workspace ",
        ["password", " email ", ' \u00e9\\"\n '],
        1_000,
        ["issues", "projects"],
        ["get_issue"],
        "auto",
        false,
        false,
        true
      ])
    )
    const owner = yield* makeCompatibilityAuthority(selected, generation, authorization)
    const challenge = yield* owner.challenge
    const reordered: ResidentSelection = {
      lazyEnvs: selected.lazyEnvs,
      telemetryEnabled: selected.telemetryEnabled,
      policy: { exposure: selected.policy.exposure, tools: selected.policy.tools, toolsets: selected.policy.toolsets },
      huly: {
        connectionTimeout: selected.huly.connectionTimeout,
        auth: selected.huly.auth,
        workspace: selected.huly.workspace,
        url: selected.huly.url
      }
    }
    yield* owner.verify(yield* makeCompatibilityProof(reordered, challenge, authorization))
  }).pipe(Effect.scoped)
)

const incompatible = [
  { ...selection(), telemetryEnabled: false },
  selection({ url: "https://other.invalid" }),
  selection({ workspace: "second" }),
  selection({ connectionTimeout: 2_000 }),
  selection({ auth: { _tag: "token", token: "rotated-token" } }),
  selection({ auth: { _tag: "password", email: "person", password: "fixture-token" } }),
  selection({}, { toolsets: ["issues"] }),
  selection({}, { tools: ["get_issue"] }),
  selection({}, { exposure: { configuredMode: "native", proxyOutputStrict: false } }),
  selection({}, { exposure: { configuredMode: "auto", proxyOutputStrict: true } }),
  selection({}, {}, true)
]

it.effect("isolates password replacement and email changes without normalizing credential bytes", () =>
  Effect.gen(function* () {
    const selected = selection({ auth: { _tag: "password", email: "person", password: " \u00e9 " } })
    const owner = yield* makeCompatibilityAuthority(selected, generation, authorization)
    for (const auth of [
      { _tag: "password", email: "other", password: " \u00e9 " },
      { _tag: "password", email: "person", password: "\u00e9" },
      { _tag: "password", email: "person", password: " e\u0301 " }
    ] satisfies Array<SelectionInput["huly"]["auth"]>) {
      const challenge = yield* owner.challenge
      const proof = yield* makeCompatibilityProof(selection({ auth }), challenge, authorization)
      expect((yield* Effect.flip(owner.verify(proof))).kind).toBe("mismatch")
    }
  }).pipe(Effect.scoped)
)

it.effect("preserves observable requested-policy order and captures an immutable selection", () =>
  Effect.gen(function* () {
    const toolsets = ["issues", "projects"]
    const base = selection()
    const selected: ResidentSelection = { ...base, policy: { ...base.policy, toolsets } }
    const owner = yield* makeCompatibilityAuthority(selected, generation, authorization)
    const changed = selection({}, { toolsets: ["projects", "issues"] })
    const first = yield* owner.challenge
    expect((yield* Effect.flip(owner.verify(yield* makeCompatibilityProof(changed, first, authorization)))).kind).toBe(
      "mismatch"
    )
    toolsets.reverse()
    const second = yield* owner.challenge
    yield* owner.verify(
      yield* makeCompatibilityProof(selection({}, { toolsets: ["issues", "projects"] }), second, authorization)
    )
  }).pipe(Effect.scoped)
)

it.effect("rejects every changed connection or process policy field without leaving a reusable challenge", () =>
  Effect.gen(function* () {
    const owner = yield* makeCompatibilityAuthority(selection(), generation, authorization)
    for (const changed of incompatible) {
      const challenge = yield* owner.challenge
      const refused = yield* Effect.flip(owner.verify(yield* makeCompatibilityProof(changed, challenge, authorization)))
      expect(refused.kind).toBe("mismatch")
      expect(JSON.stringify(refused)).not.toContain("fixture-token")
      const retry = yield* Effect.flip(
        owner.verify(yield* makeCompatibilityProof(selection(), challenge, authorization))
      )
      expect(retry.kind).toBe("unknown")
    }
  }).pipe(Effect.scoped)
)

it.effect("binds the proof to daemon authorization, package, and expected generation", () =>
  Effect.gen(function* () {
    const owner = yield* makeCompatibilityAuthority(selection(), generation, authorization)
    const first = yield* owner.challenge
    const wrongKey = yield* makeCompatibilityProof(selection(), first, Redacted.make("other-daemon-authorization"))
    expect((yield* Effect.flip(owner.verify(wrongKey))).kind).toBe("mismatch")
    const second = yield* owner.challenge
    const wrongGeneration = yield* makeCompatibilityProof(
      selection(),
      { ...second, generation: otherGeneration },
      authorization
    )
    expect((yield* Effect.flip(owner.verify(wrongGeneration))).kind).toBe("mismatch")
    const third = yield* owner.challenge
    const wrongPackage = yield* makeCompatibilityProof(
      selection(),
      { ...third, implementation: "other-package-version" },
      authorization
    )
    expect((yield* Effect.flip(owner.verify(wrongPackage))).kind).toBe("mismatch")
  }).pipe(Effect.scoped)
)

it.effect("expires challenges at five seconds and prunes capacity without a background timer", () =>
  Effect.gen(function* () {
    const owner = yield* makeCompatibilityAuthority(selection(), generation, authorization)
    const first = yield* owner.challenge
    for (let index = 1; index < MAX_COMPATIBILITY_CHALLENGES; index++) yield* owner.challenge
    expect((yield* Effect.flip(owner.challenge)).kind).toBe("capacity")
    yield* TestClock.adjust("5 seconds")
    const proof = yield* makeCompatibilityProof(selection(), first, authorization)
    expect((yield* Effect.flip(owner.verify(proof))).kind).toBe("unknown")
    yield* owner.challenge
  }).pipe(Effect.scoped)
)

it.effect("does not replace an outstanding challenge on entropy collision", () =>
  Effect.gen(function* () {
    const nonce = Schema.decodeUnknownSync(CompatibilityNonce)("a".repeat(64))
    const owner = yield* makeCompatibilityAuthority(selection(), generation, authorization, Effect.succeed(nonce))
    const first = yield* owner.challenge
    expect((yield* Effect.flip(owner.challenge)).kind).toBe("unknown")
    yield* owner.verify(yield* makeCompatibilityProof(selection(), first, authorization))
  }).pipe(Effect.scoped)
)

it.effect("binds proofs to their issued nonce and still permits another outstanding challenge", () =>
  Effect.gen(function* () {
    const owner = yield* makeCompatibilityAuthority(selection(), generation, authorization)
    const first = yield* owner.challenge
    const second = yield* owner.challenge
    const proof = yield* makeCompatibilityProof(selection(), first, authorization)
    expect((yield* Effect.flip(owner.verify({ ...proof, nonce: second.nonce }))).kind).toBe("mismatch")
    yield* owner.verify(proof)
  }).pipe(Effect.scoped)
)

it.effect("allows only one concurrent verification and refuses all control after scope closure", () =>
  Effect.gen(function* () {
    const scope = yield* Scope.make()
    const owner = yield* makeCompatibilityAuthority(selection(), generation, authorization).pipe(Scope.provide(scope))
    const first = yield* owner.challenge
    const proof = yield* makeCompatibilityProof(selection(), first, authorization)
    const left = yield* owner.verify(proof).pipe(Effect.result, Effect.forkChild)
    const right = yield* owner.verify(proof).pipe(Effect.result, Effect.forkChild)
    const results = [yield* Fiber.join(left), yield* Fiber.join(right)]
    expect(results.filter((result) => result._tag === "Success")).toHaveLength(1)
    const pending = yield* owner.challenge
    yield* Scope.close(scope, Exit.void)
    expect((yield* Effect.flip(owner.challenge)).kind).toBe("unknown")
    expect(
      (yield* Effect.flip(owner.verify(yield* makeCompatibilityProof(selection(), pending, authorization)))).kind
    ).toBe("unknown")
  }).pipe(Effect.scoped)
)
