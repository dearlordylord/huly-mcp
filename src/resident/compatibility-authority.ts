import { createNoopTelemetry } from "../telemetry/noop.js"
import { reportTelemetry } from "../telemetry/events.js"
import type { TelemetryOperations } from "../telemetry/telemetry.js"
import { randomBytes } from "node:crypto"
import { Clock, Effect, Redacted, Schema } from "effect"

import { VERSION } from "../version.js"
import {
  COMPATIBILITY_CHALLENGE_MILLIS,
  type CompatibilityChallenge,
  CompatibilityError,
  CompatibilityNonce,
  type CompatibilityProof,
  MAX_COMPATIBILITY_CHALLENGES,
  type ResidentSelection
} from "./compatibility-contract.js"
import {
  compatibilityMacMatches,
  computeCompatibilityMac,
  deriveCompatibilityKey,
  encodeCompatibilitySelection
} from "./compatibility-crypto.js"
import type { ResidentTlsIdentity } from "./tls-channel.js"

const NONCE_BYTES = 32
const NANOS_PER_MILLISECOND = 1_000_000n
const unknownChallenge = () =>
  new CompatibilityError({ kind: "unknown", message: "Resident comparison challenge is unavailable or expired" })
const mismatch = () =>
  new CompatibilityError({ kind: "mismatch", message: "Resident configuration is incompatible with this selection" })
const freshNonce = Effect.try({
  try: () => Schema.decodeUnknownSync(CompatibilityNonce)(randomBytes(NONCE_BYTES).toString("hex")),
  catch: () =>
    new CompatibilityError({ kind: "entropy", message: "Resident comparison challenge could not be created" })
})

export const makeCompatibilityAuthority = Effect.fn("makeCompatibilityAuthority")(function* (
  selection: ResidentSelection,
  generation: ResidentTlsIdentity["generation"],
  authorization: Redacted.Redacted<string>,
  nonces: Effect.Effect<CompatibilityNonce, CompatibilityError> = freshNonce,
  telemetry: TelemetryOperations = createNoopTelemetry()
) {
  const encoded = yield* encodeCompatibilitySelection(selection)
  const pending = new Map<string, bigint>()
  let closed = false
  const key = yield* Effect.acquireRelease(
    Effect.sync(() => deriveCompatibilityKey(authorization)),
    (owned) =>
      Effect.sync(() => {
        closed = true
        pending.clear()
        owned.fill(0)
      })
  )
  const challenge = Effect.gen(function* () {
    const nonce = yield* nonces
    return yield* Clock.clockWith((clock) =>
      Effect.suspend(() => {
        if (closed) return Effect.fail(unknownChallenge())
        const now = clock.monotonicTimeNanosUnsafe()
        for (const [candidate, expires] of pending) if (now >= expires) pending.delete(candidate)
        if (pending.size >= MAX_COMPATIBILITY_CHALLENGES)
          return Effect.fail(
            new CompatibilityError({ kind: "capacity", message: "Resident comparison challenge capacity reached" })
          )
        const identity = Redacted.value(nonce)
        if (pending.has(identity)) return Effect.fail(unknownChallenge())
        pending.set(identity, now + BigInt(COMPATIBILITY_CHALLENGE_MILLIS) * NANOS_PER_MILLISECOND)
        return Effect.succeed({
          version: 1,
          implementation: VERSION,
          generation,
          nonce
        } satisfies CompatibilityChallenge)
      })
    )
  })
  const verify = (proof: CompatibilityProof) =>
    Clock.clockWith((clock) =>
      Effect.suspend(() => {
        const identity = Redacted.value(proof.nonce)
        const expires = pending.get(identity)
        pending.delete(identity)
        if (closed || expires === undefined || clock.monotonicTimeNanosUnsafe() >= expires)
          return Effect.fail(unknownChallenge())
        if (proof.generation !== generation || proof.implementation !== VERSION) return Effect.fail(mismatch())
        const expected = computeCompatibilityMac(encoded, proof, key)
        return compatibilityMacMatches(expected, proof.mac) ? Effect.void : Effect.fail(mismatch())
      })
    )
  const observe = <A>(effect: Effect.Effect<A, CompatibilityError>) =>
    effect.pipe(
      Effect.tapError((error) =>
        Effect.sync(() =>
          reportTelemetry(() => telemetry.residentFailure({ stage: "compatibility", reason: error.kind }))
        )
      )
    )
  return { challenge: observe(challenge), verify: (proof: CompatibilityProof) => observe(verify(proof)) }
})
