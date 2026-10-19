import { it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"

import { LiveProbeEnvironment } from "../../scripts/resident-live-read-contract.js"
import { probeIo, withLiveProbeChild } from "../../scripts/resident-live-read-process.js"

const environment = Schema.decodeUnknownSync(LiveProbeEnvironment)({})

it.effect("maps rejected probe I/O to its phase without exposing the cause", () =>
  Effect.gen(function* () {
    const error = yield* probeIo("response", () => Promise.reject(new Error("private probe detail"))).pipe(Effect.flip)

    expect(error._tag).toBe("LiveReadProbeError")
    expect(error.phase).toBe("response")
    expect(error.message).not.toContain("private probe detail")
  })
)

it.effect("joins a child on stdin EOF while preserving the caller's failure", () =>
  Effect.gen(function* () {
    const primary = new Error("caller failure")
    let childClosed = false
    const result = yield* withLiveProbeChild(["-e", "process.stdin.resume()"], environment, (owned) => {
      owned.process.once("close", () => {
        childClosed = true
      })
      return Effect.fail(primary)
    }).pipe(Effect.flip)

    expect(result).toBe(primary)
    expect(childClosed).toBe(true)
  })
)

it.effect("reports a nonzero child exit after joining that child", () =>
  Effect.gen(function* () {
    const error = yield* withLiveProbeChild(["-e", "process.exit(7)"], environment, (owned) =>
      owned.closed.pipe(Effect.asVoid)
    ).pipe(Effect.flip)

    expect(error._tag).toBe("LiveReadProbeError")
    expect(error.phase).toBe("cleanup")
  })
)

it.effect("treats a real child stdin error as failed process evidence", () =>
  Effect.gen(function* () {
    const error = yield* withLiveProbeChild(["-e", "process.stdin.resume()"], environment, (owned) =>
      Effect.gen(function* () {
        yield* Effect.promise(
          () =>
            new Promise<void>((resolve) => {
              owned.process.stdin.once("error", resolve)
              owned.process.stdin.destroy(new Error("private child stdin failure"))
            })
        )
        yield* owned.closed
      })
    ).pipe(Effect.flip)

    expect(error._tag).toBe("LiveReadProbeError")
    expect(error.phase).toBe("cleanup")
  })
)

it.live(
  "kills and joins a child that keeps running after stdin closes",
  () =>
    Effect.gen(function* () {
      const error = yield* withLiveProbeChild(
        ["-e", "setInterval(() => {}, 1000)"],
        environment,
        () => Effect.void
      ).pipe(Effect.flip)

      expect(error._tag).toBe("LiveReadProbeError")
      expect(error.phase).toBe("cleanup")
    }),
  10_000
)

it.effect("maps invalid child arguments to a typed spawn failure", () =>
  Effect.gen(function* () {
    const error = yield* withLiveProbeChild(["\u0000"], environment, () => Effect.void).pipe(Effect.flip)

    expect(error._tag).toBe("LiveReadProbeError")
    expect(error.phase).toBe("spawn")
  })
)
