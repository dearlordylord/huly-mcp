import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { Effect, Redacted, Result } from "effect"

import { makeNativeCredentials } from "../src/profiles/native-credentials.js"

const command = promisify(execFile)
const native = makeNativeCredentials(process.platform, process.env)
const key = `huly-qualification-${process.pid}`

const program = Effect.gen(function* () {
  assert(native !== undefined, "Native verification requires macOS or Linux.")
  const original = Redacted.make("huly-native-original-sentinel")
  const replacement = Redacted.make("huly-native-replacement-sentinel")
  if (process.argv.includes("--unavailable")) {
    assert(
      Result.isFailure(yield* native.read(key).pipe(Effect.result)),
      "Unavailable native read unexpectedly succeeded."
    )
    assert(
      Result.isFailure(yield* native.save(key, original).pipe(Effect.result)),
      "Unavailable native save unexpectedly succeeded."
    )
    assert(
      Result.isFailure(yield* native.remove(key).pipe(Effect.result)),
      "Unavailable native delete unexpectedly succeeded."
    )
    return
  }
  assert.equal(yield* native.read(key), undefined)
  yield* native.save(key, original)
  const first = yield* native.read(key)
  assert(first !== undefined)
  assert.equal(Redacted.value(first), Redacted.value(original))
  yield* native.save(key, replacement)
  const second = yield* native.read(key)
  assert(second !== undefined)
  assert.equal(Redacted.value(second), Redacted.value(replacement))
  if (process.argv.includes("--locked")) {
    assert.equal(process.platform, "linux", "Automated locked-collection fixture requires Linux.")
    yield* Effect.promise(() =>
      command("gdbus", [
        "call",
        "--session",
        "--dest",
        "org.freedesktop.secrets",
        "--object-path",
        "/org/freedesktop/secrets",
        "--method",
        "org.freedesktop.Secret.Service.Lock",
        '["/org/freedesktop/secrets/collection/login"]'
      ])
    )
    assert(Result.isFailure(yield* native.read(key).pipe(Effect.result)), "Locked read unexpectedly succeeded.")
    assert(
      Result.isFailure(yield* native.save(key, original).pipe(Effect.result)),
      "Locked save unexpectedly succeeded."
    )
    assert(Result.isFailure(yield* native.remove(key).pipe(Effect.result)), "Locked delete unexpectedly succeeded.")
    return
  }
  yield* native.remove(key)
  assert.equal(yield* native.read(key), undefined)
  yield* native.remove(key)
})

Effect.runPromise(program).then(
  () => process.stdout.write("PASS: real native credential probe; no credential material emitted.\n"),
  () => {
    process.stderr.write("FAIL: native credential probe.\n")
    process.exitCode = 1
  }
)
