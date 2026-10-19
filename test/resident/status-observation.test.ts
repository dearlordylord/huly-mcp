import { NodeServices } from "@effect/platform-node"
import { Command } from "effect/cli"
import { Effect, Ref, Schema } from "effect"
import { TestConsole } from "effect/testing"
import { expect, it } from "vitest"

import { residentCommand } from "../../packages/huly-cli/src/resident-commands.js"
import { ResidentAttachment, withPublishedResidentAttachment } from "../../src/resident/attachment-file.js"
import { openGenerationRegistry } from "../../src/resident/generation-registry.js"
import { ResidentLiveStatus } from "../../src/resident/status-contract.js"
import { renderResidentStatus } from "../../src/resident/status-http.js"
import { observeResidentState, ResidentStateStatus } from "../../src/resident/state-status.js"
import { VERSION } from "../../src/version.js"
import { AUTHORIZATION, withNativeServer, type Owner, type OwnerName } from "../helpers/resident-native-fixture.js"
import { withRegistryDirectory } from "../helpers/resident-registry-fixture.js"
import { HulyInitializationStatus } from "../../src/runtime/client-initialization.js"

it("observes a protected live generation through the CLI without altering ownership or acquiring work", async () => {
  await withRegistryDirectory((directory) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const current = yield* Ref.make<Effect.Effect<ResidentLiveStatus>>(Effect.die("Uninitialized fixture status"))
        yield* withNativeServer(
          new Map<OwnerName, Owner>(),
          (endpoint, identity) =>
            Effect.gen(function* () {
              const live = ResidentLiveStatus.make({
                statusWire: 1,
                generation: identity.generation,
                readiness: "ready",
                hulyInitialization: "ready",
                retirement: "unconfirmed",
                work: {
                  admission: "accepting",
                  attachments: 2,
                  pendingAdmissions: 0,
                  retainedRequests: 1,
                  blockedRequests: 0,
                  drain: "idle"
                }
              })
              yield* Ref.set(current, Effect.succeed(live))
              const attachment = ResidentAttachment.make({
                version: 1,
                transport: "tls13-external-psk-v1",
                endpoint,
                identity,
                authorization: AUTHORIZATION,
                implementation: { name: "@firfi/huly-mcp", version: VERSION }
              })
              yield* withPublishedResidentAttachment(directory, attachment, () =>
                Effect.gen(function* () {
                  const registry = yield* openGenerationRegistry(directory)
                  yield* Effect.acquireUseRelease(
                    registry.publish(attachment),
                    () =>
                      Effect.gen(function* () {
                        expect(yield* observeResidentState(directory)).toMatchObject({
                          state: "observed",
                          generations: [{ observation: { kind: "authenticated", status: live } }]
                        })
                        for (const initialization of HulyInitializationStatus.literals) {
                          const observed = { ...live, hulyInitialization: initialization }
                          yield* Ref.set(current, Effect.succeed(observed))
                          for (const json of [true, false]) {
                            yield* Command.runWith(residentCommand, { version: "test", renderErrors: false })([
                              "status",
                              "--state-directory",
                              directory,
                              ...(json ? ["--json"] : [])
                            ]).pipe(Effect.provide(NodeServices.layer))
                            const output = (yield* TestConsole.logLines).at(-1)
                            expect(output).toBeDefined()
                            if (json) {
                              const status = yield* Schema.decodeUnknownEffect(
                                Schema.fromJsonString(ResidentStateStatus)
                              )(output)
                              expect(status).toMatchObject({
                                generations: [{ observation: { kind: "authenticated", status: observed } }]
                              })
                            } else {
                              expect(output).toContain(`readiness=ready hulyInitialization=${initialization}`)
                              expect(output).toContain("admission=accepting attachments=2")
                              if (initialization === "initializing") expect(output).toContain("including model loading")
                            }
                          }
                        }
                        expect(yield* registry.inventory).toHaveLength(1)
                      }),
                    (record) => record.retire
                  )
                })
              )
            }),
          { middleware: () => renderResidentStatus(Ref.get(current).pipe(Effect.flatMap((status) => status))) }
        )
      }).pipe(Effect.scoped, Effect.provide(TestConsole.layer))
    )
  )
})
