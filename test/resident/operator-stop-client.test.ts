import * as fs from "node:fs/promises"
import { IncomingMessage } from "node:http"
import { join } from "node:path"
import { NodeServices } from "@effect/platform-node"
import { Effect, Exit, Redacted, Ref, Schema } from "effect"
import { Command } from "effect/cli"
import { TestConsole } from "effect/testing"
import { HttpServerRequest, HttpServerResponse } from "effect/http"
import { expect, it } from "vitest"

import { residentCommand } from "../../packages/huly-cli/src/resident-commands.js"
import { CliRuntimeError } from "../../packages/huly-cli/src/render.js"
import { AdmissionPolicy, DEFAULT_LEASE_POLICY } from "../../src/resident/admission-contract.js"
import { residentAdmissionMiddleware } from "../../src/resident/admission-http.js"
import { makeResidentAdmissions } from "../../src/resident/admissions.js"
import { ResidentAttachment, withPublishedResidentAttachment } from "../../src/resident/attachment-file.js"
import { openGenerationRegistry } from "../../src/resident/generation-registry.js"
import { ResidentRegistryEnvelope } from "../../src/resident/managed-contract.js"
import {
  requestResidentStop,
  ResidentStopRefused,
  ResidentStopReport,
  type ResidentStopTarget,
  type ResidentStopSupport
} from "../../src/resident/operator-stop.js"
import { ResidentDirectory } from "../../src/resident/protected-path.js"
import { VERSION } from "../../src/version.js"
import { AUTHORIZATION, withNativeServer, type Owner, type OwnerName } from "../helpers/resident-native-fixture.js"
import { withRegistryDirectory } from "../helpers/resident-registry-fixture.js"

const OTHER_GENERATION = Schema.decodeUnknownSync(ResidentAttachment.fields.identity.fields.generation)(
  "00000000-0000-4000-8000-000000000000"
)
const policy = Schema.decodeUnknownSync(AdmissionPolicy)({
  capacity: 1,
  closeAllowanceMillis: 5_000,
  lease: DEFAULT_LEASE_POLICY
})

const invokeCli = (
  schedule: "cli-accepted" | "cli-accepted-text" | "cli-ack-lost" | "cli-unsupported",
  target: ResidentStopTarget
) =>
  Effect.gen(function* () {
    const run = Command.runWith(residentCommand, { version: "different-cli-version", renderErrors: false })([
      "stop",
      "--generation",
      target.generation,
      "--state-directory",
      target.directory,
      ...(schedule === "cli-accepted-text" ? [] : ["--json"])
    ]).pipe(Effect.provide(NodeServices.layer))
    if (schedule === "cli-unsupported") {
      const error = yield* run.pipe(Effect.flip)
      expect(error).toBeInstanceOf(CliRuntimeError)
      if (error instanceof CliRuntimeError) {
        expect(error.kind).toBe("input")
        expect(error.retryable).toBe(false)
        expect(error.message).toContain("unsupported")
      }
      expect(yield* TestConsole.logLines).toEqual([])
      return yield* error
    }
    if (schedule === "cli-ack-lost") {
      const error = yield* run.pipe(Effect.flip)
      expect(error).toBeInstanceOf(CliRuntimeError)
      if (error instanceof CliRuntimeError) {
        expect(error.kind).toBe("conflict")
        expect(error.retryable).toBe(false)
        expect(error.message).toContain("submission and retirement are unconfirmed")
      }
      expect(yield* TestConsole.logLines).toEqual([])
      return {
        kind: "unconfirmed",
        generation: target.generation,
        submission: "unknown",
        retirement: "unconfirmed"
      } satisfies ResidentStopReport
    }
    yield* run
    if (schedule === "cli-accepted-text") {
      expect((yield* TestConsole.logLines).join("\n")).toBe(
        `Stop accepted for generation ${target.generation}; retirement is unconfirmed.`
      )
      return { kind: "accepted", generation: target.generation, retirement: "unconfirmed" } satisfies ResidentStopReport
    }
    return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(ResidentStopReport))(
      (yield* TestConsole.logLines).join("\n")
    )
  }).pipe(Effect.provide(TestConsole.layer))

it.each([
  "accepted",
  "ack-lost",
  "invalid-ack",
  "unexpected-status",
  "unsupported",
  "wrong-capability",
  "wrong-bearer",
  "explicit-refusal",
  "wrong-ack-generation",
  "cli-accepted",
  "cli-accepted-text",
  "cli-unsupported",
  "cli-ack-lost"
] as const)(
  "submits at most once and preserves state for %s through actual protected files and TLS",
  async (schedule) =>
    withRegistryDirectory(async (directory) => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const admissions = yield* makeResidentAdmissions(policy)
          const support = yield* Ref.make<ResidentStopSupport>({ kind: "unsupported" })
          const posts = yield* Ref.make(0)
          yield* withNativeServer(
            new Map<OwnerName, Owner>(),
            (endpoint, identity) =>
              Effect.gen(function* () {
                if (schedule !== "unsupported" && schedule !== "cli-unsupported")
                  yield* Ref.set(support, {
                    kind: "managed",
                    generation: schedule === "wrong-capability" ? OTHER_GENERATION : identity.generation,
                    fence: admissions.fence
                  })
                const attachment = ResidentAttachment.make({
                  version: 1,
                  transport: "tls13-external-psk-v1",
                  implementation: { name: "@firfi/huly-mcp", version: VERSION },
                  endpoint,
                  identity,
                  authorization: schedule === "wrong-bearer" ? Redacted.make("wrong-bearer") : AUTHORIZATION
                })
                yield* withPublishedResidentAttachment(directory, attachment, () =>
                  Effect.gen(function* () {
                    const registry = yield* openGenerationRegistry(directory)
                    yield* Effect.acquireUseRelease(
                      registry.publish(attachment),
                      (record) =>
                        Effect.gen(function* () {
                          // Another implementation version with the same control wire is intentional.
                          const original = yield* Effect.promise(() => fs.readFile(record.file, "utf8"))
                          const envelope = yield* Schema.decodeUnknownEffect(
                            Schema.fromJsonString(ResidentRegistryEnvelope)
                          )(original)
                          const implementation = {
                            ...attachment.implementation,
                            version: `${VERSION}-control-fixture.1`
                          }
                          const descriptor = yield* Schema.encodeEffect(ResidentAttachment)({
                            ...attachment,
                            implementation
                          })
                          const published = join(directory, `${identity.generation}.json`)
                          const publishedText = yield* Schema.encodeEffect(Schema.fromJsonString(ResidentAttachment))({
                            ...attachment,
                            implementation
                          })
                          yield* Effect.promise(() => fs.writeFile(published, publishedText))
                          const rewritten = yield* Schema.encodeEffect(Schema.fromJsonString(ResidentRegistryEnvelope))(
                            { ...envelope, implementation, descriptor: Redacted.make(descriptor) }
                          )
                          yield* Effect.promise(() => fs.writeFile(record.file, rewritten))
                          const target = { directory, generation: identity.generation }
                          const result: Exit.Exit<
                            ResidentStopReport,
                            Effect.Error<ReturnType<typeof invokeCli>> | ResidentStopRefused
                          > =
                            schedule === "cli-accepted" ||
                            schedule === "cli-accepted-text" ||
                            schedule === "cli-ack-lost" ||
                            schedule === "cli-unsupported"
                              ? yield* Effect.exit(invokeCli(schedule, target))
                              : yield* Effect.exit(requestResidentStop(target))
                          if (
                            schedule === "unsupported" ||
                            schedule === "cli-unsupported" ||
                            schedule === "wrong-capability" ||
                            schedule === "wrong-bearer" ||
                            schedule === "explicit-refusal"
                          ) {
                            expect(Exit.isFailure(result)).toBe(true)
                            expect(yield* Ref.get(posts)).toBe(schedule === "explicit-refusal" ? 1 : 0)
                            yield* admissions.release((yield* admissions.admit).token)
                          } else {
                            expect(Exit.isSuccess(result)).toBe(true)
                            if (Exit.isSuccess(result))
                              expect(result.value).toEqual(
                                schedule === "accepted" ||
                                  schedule === "cli-accepted" ||
                                  schedule === "cli-accepted-text"
                                  ? { kind: "accepted", generation: identity.generation, retirement: "unconfirmed" }
                                  : {
                                      kind: "unconfirmed",
                                      generation: identity.generation,
                                      submission: "unknown",
                                      retirement: "unconfirmed"
                                    }
                              )
                            expect(yield* Ref.get(posts)).toBe(1)
                            expect(Exit.isFailure(yield* Effect.exit(admissions.admit))).toBe(true)
                          }
                          expect(yield* Effect.promise(() => fs.readFile(record.file, "utf8"))).toBe(rewritten)
                          expect(yield* Effect.promise(() => fs.readFile(published, "utf8"))).toBe(publishedText)
                        }),
                      (record) => record.retire
                    )
                  })
                )
              }),
            {
              middleware: (app) =>
                Effect.gen(function* () {
                  const request = yield* HttpServerRequest.HttpServerRequest
                  if (request.method === "POST") yield* Ref.update(posts, (count) => count + 1)
                  const response = yield* residentAdmissionMiddleware(
                    admissions,
                    undefined,
                    yield* Ref.get(support)
                  )(app)
                  if (request.method === "GET" && schedule === "explicit-refusal")
                    yield* Ref.set(support, { kind: "unsupported" })
                  if (request.method === "POST" && (schedule === "ack-lost" || schedule === "cli-ack-lost")) {
                    if (!(request.source instanceof IncomingMessage))
                      return yield* Effect.die("Expected native request fixture")
                    request.source.socket.destroy()
                  }
                  return request.method === "POST" && schedule === "unexpected-status"
                    ? HttpServerResponse.empty({ status: 503 })
                    : request.method === "POST" && schedule === "invalid-ack"
                      ? HttpServerResponse.jsonUnsafe({}, { status: 202 })
                      : request.method === "POST" && schedule === "wrong-ack-generation"
                        ? HttpServerResponse.jsonUnsafe(
                            {
                              stopWire: 1,
                              generation: OTHER_GENERATION,
                              accepted: "admission-fenced",
                              retirement: "unconfirmed"
                            },
                            { status: 202 }
                          )
                        : response
                })
            }
          )
        }).pipe(Effect.scoped, Effect.timeout("5 seconds"))
      )
    })
)

it("refuses an absent target without creating a namespace or claiming retirement", async () =>
  withRegistryDirectory(async (root) => {
    const directory = ResidentDirectory.make(join(root, "absent"))
    const error = await Effect.runPromise(
      requestResidentStop({ directory, generation: OTHER_GENERATION }).pipe(Effect.flip)
    )
    expect(error).toBeInstanceOf(ResidentStopRefused)
    expect(error.reason).toBe("target-missing")
    expect(error.message).toContain("not retirement evidence")
    expect(await fs.readdir(root)).toEqual([])
  }))

it("preserves an unverified namespace and refuses before submitting stop", async () =>
  withRegistryDirectory(async (directory) => {
    const unexpected = join(directory, "unrecognized-owner-state")
    await fs.writeFile(unexpected, "preserve this unresolved evidence", { mode: 0o600 })
    const error = await Effect.runPromise(
      requestResidentStop({ directory, generation: OTHER_GENERATION }).pipe(Effect.flip)
    )
    expect(error).toBeInstanceOf(ResidentStopRefused)
    expect(error.reason).toBe("namespace-unverified")
    expect(error.message).toContain("No stop was submitted")
    expect(await fs.readdir(directory)).toEqual(["unrecognized-owner-state"])
    expect(await fs.readFile(unexpected, "utf8")).toBe("preserve this unresolved evidence")
  }))
