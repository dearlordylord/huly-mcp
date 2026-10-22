import { join } from "node:path"
import { Deferred, Effect, Fiber, Option, Result, Schema, Stream } from "effect"
import { expect, it } from "vitest"

import { requestContextMiddleware } from "../../src/mcp/http-request-context.js"
import { AdmissionPolicy, DEFAULT_LEASE_POLICY } from "../../src/resident/admission-contract.js"
import { residentAdmissionMiddleware } from "../../src/resident/admission-http.js"
import { makeResidentAdmissions } from "../../src/resident/admissions.js"
import { ResidentAttachment, withPublishedResidentAttachment } from "../../src/resident/attachment-file.js"
import { makeCompatibilityAuthority } from "../../src/resident/compatibility-authority.js"
import type { ResidentStartupCapture } from "../../src/resident/managed-contract.js"
import type { ResidentDirectory } from "../../src/resident/protected-path.js"
import { openGenerationRegistry } from "../../src/resident/generation-registry.js"
import { withResidentSelection } from "../../src/resident/managed-selection.js"
import { captureResidentSelection } from "../../src/resident/selection-config.js"
import { makeStartupBudget } from "../../src/resident/startup-budget.js"
import { VERSION } from "../../src/version.js"
import {
  AUTHORIZATION,
  type Owner,
  type OwnerName,
  ping,
  withNativeServer
} from "../helpers/resident-native-fixture.js"
import { withRegistryDirectory } from "../helpers/resident-registry-fixture.js"

const policy = Schema.decodeUnknownSync(AdmissionPolicy)({
  capacity: 1,
  closeAllowanceMillis: 1_000,
  lease: DEFAULT_LEASE_POLICY
})

const captureSelection = captureResidentSelection({
  HULY_URL: "https://continuity.invalid",
  HULY_WORKSPACE: "fixture",
  HULY_TOKEN: "continuity-fixture"
})
type Admissions = Effect.Success<ReturnType<typeof makeResidentAdmissions>>

const withOwner = <A, E, R>(
  directory: ResidentDirectory,
  capture: ResidentStartupCapture,
  releasePolicy: "fence" | "retain",
  use: (admissions: Admissions, generation: ResidentAttachment["identity"]["generation"]) => Effect.Effect<A, E, R>
) =>
  Effect.gen(function* () {
    const admissions = yield* makeResidentAdmissions(policy)
    const authority = yield* Deferred.make<Effect.Success<ReturnType<typeof makeCompatibilityAuthority>>>()
    const native = requestContextMiddleware({
      resolveClients: () => Promise.reject(new Error("Ping must not acquire Huly"))
    })
    return yield* withNativeServer(
      new Map<OwnerName, Owner>(),
      (endpoint, identity) =>
        Effect.gen(function* () {
          yield* Deferred.succeed(
            authority,
            yield* makeCompatibilityAuthority(capture.selection, identity.generation, AUTHORIZATION)
          )
          const registry = yield* openGenerationRegistry(directory)
          const descriptor = ResidentAttachment.make({
            telemetryEnabled: capture.selection.telemetryEnabled,
            version: 1,
            transport: "tls13-external-psk-v1",
            implementation: { name: "@firfi/huly-mcp", version: VERSION },
            endpoint,
            identity,
            authorization: AUTHORIZATION
          })
          return yield* withPublishedResidentAttachment(directory, descriptor, () =>
            Effect.acquireUseRelease(
              registry.publish(descriptor),
              () => use(admissions, identity.generation),
              (receipt) => receipt.retire
            )
          )
        }),
      {
        middleware: (app) =>
          Deferred.await(authority).pipe(
            Effect.flatMap((owner) =>
              residentAdmissionMiddleware(
                {
                  ...admissions,
                  release: (token) =>
                    admissions
                      .release(token)
                      .pipe(Effect.andThen(releasePolicy === "fence" ? admissions.fence : Effect.void))
                },
                owner
              )(native(app))
            )
          )
      }
    )
  })

it("keeps a compatible owner's admission until caller use instead of creating an idle gap", async () =>
  withRegistryDirectory(async (directory) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const capture = yield* captureSelection
        yield* withOwner(directory, capture, "fence", () =>
          Effect.gen(function* () {
            const status = yield* withResidentSelection({
              directory,
              capture,
              startup: yield* makeStartupBudget,
              existing: (_file, exchange) =>
                exchange(ping, Option.none(), (response) =>
                  Stream.runDrain(response.stream).pipe(Effect.as(response.status))
                ),
              absent: () => Effect.die("A compatible owner must not be replaced")
            })
            expect(status).toBe(200)
          })
        )
      }).pipe(Effect.scoped, Effect.timeout("5 seconds"))
    )
  ))

it("refuses two compatible owners and releases both admissions without using either", async () =>
  withRegistryDirectory(async (directory) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const capture = yield* captureSelection
        yield* withOwner(directory, capture, "retain", (first) =>
          withOwner(directory, capture, "retain", (second) =>
            Effect.gen(function* () {
              const outcome = yield* withResidentSelection({
                directory,
                capture,
                startup: yield* makeStartupBudget,
                existing: () => Effect.die("Ambiguous owner was used"),
                absent: () => Effect.die("Ambiguous owners were replaced")
              }).pipe(Effect.result)
              expect(Result.isFailure(outcome)).toBe(true)
              if (Result.isFailure(outcome))
                expect("reason" in outcome.failure ? outcome.failure.reason : undefined).toBe("ownership")
              for (const admissions of [first, second]) {
                const admitted = yield* admissions.admit
                yield* admissions.release(admitted.token)
              }
            })
          )
        )
      }).pipe(Effect.scoped, Effect.timeout("5 seconds"))
    )
  ))

it("releases the retained admission when the selected caller is interrupted", async () =>
  withRegistryDirectory(async (directory) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const capture = yield* captureSelection
        yield* withOwner(directory, capture, "retain", (admissions) =>
          Effect.gen(function* () {
            const connected = yield* Deferred.make<void>()
            const caller = yield* withResidentSelection({
              directory,
              capture,
              startup: yield* makeStartupBudget,
              existing: () => Deferred.succeed(connected, undefined).pipe(Effect.andThen(Effect.never)),
              absent: () => Effect.die("Compatible owner was replaced")
            }).pipe(Effect.forkChild)
            yield* Deferred.await(connected)
            yield* Fiber.interrupt(caller)
            const admitted = yield* admissions.admit
            yield* admissions.release(admitted.token)
          })
        )
      }).pipe(Effect.scoped, Effect.timeout("5 seconds"))
    )
  ))

it("uses the unique compatible owner among different configurations", async () =>
  withRegistryDirectory(async (directory) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const capture = yield* captureSelection
        const different = {
          ...capture,
          selection: { ...capture.selection, huly: { ...capture.selection.huly, workspace: "another-workspace" } }
        }
        yield* withOwner(directory, different, "retain", (other) =>
          withOwner(directory, capture, "retain", (matching, generation) =>
            Effect.gen(function* () {
              const status = yield* withResidentSelection({
                directory,
                capture,
                startup: yield* makeStartupBudget,
                existing: (file, exchange) => {
                  expect(file).toBe(join(directory, `${generation}.json`))
                  return exchange(ping, Option.none(), (response) =>
                    Stream.runDrain(response.stream).pipe(Effect.as(response.status))
                  )
                },
                absent: () => Effect.die("A unique compatible owner was replaced")
              })
              expect(status).toBe(200)
              for (const admissions of [other, matching]) {
                const admitted = yield* admissions.admit
                yield* admissions.release(admitted.token)
              }
            })
          )
        )
      }).pipe(Effect.scoped, Effect.timeout("5 seconds"))
    )
  ))
