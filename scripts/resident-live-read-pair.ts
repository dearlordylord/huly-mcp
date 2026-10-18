import { createInterface } from "node:readline"
import { Effect, Result, Schema } from "effect"

import { readResidentAttachmentEnvelope } from "../src/resident/attachment-file.js"
import {
  type LiveProbeEnvironment,
  type LiveReadPairInput,
  LiveReadHostInput,
  LiveReadHostReceipt,
  LiveReadPairReceipt,
  LiveReadProbeError,
  LiveReadProbeDiagnostic
} from "./resident-live-read-contract.js"
import { withLiveProbeChild, type LiveProbeChild } from "./resident-live-read-process.js"

const PARENT_REPORT_BOUND = "40 seconds"
const MAX_RECEIPT_KIB = 64
const MAX_RECEIPT_BYTES = MAX_RECEIPT_KIB * 1024
const receive = (owned: LiveProbeChild) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const output = createInterface({ input: owned.process.stdout })
      const diagnostics = createInterface({ input: owned.process.stderr })
      let failure: Schema.Schema.Type<typeof LiveReadProbeDiagnostic> | undefined
      diagnostics.on("line", (line) => {
        if (Buffer.byteLength(line) > MAX_RECEIPT_BYTES) return
        const parsed = Schema.decodeUnknownResult(Schema.fromJsonString(LiveReadProbeDiagnostic))(line)
        if (Result.isSuccess(parsed)) failure = parsed.success
      })
      return { output, diagnostics, failure: () => failure }
    }),
    (streams) =>
      Effect.gen(function* () {
        const incoming = streams.output[Symbol.asyncIterator]()
        const next = yield* Effect.tryPromise({
          try: () => incoming.next(),
          catch: () => new LiveReadProbeError({ phase: "pair" })
        }).pipe(Effect.timeout(PARENT_REPORT_BOUND))
        if (next.done) {
          yield* owned.closed
          return yield* new LiveReadProbeError({ phase: streams.failure()?.phase ?? "pair" })
        }
        if (Buffer.byteLength(next.value) > MAX_RECEIPT_BYTES) return yield* new LiveReadProbeError({ phase: "pair" })
        const receipt = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(LiveReadHostReceipt))(next.value).pipe(
          Effect.mapError(() => new LiveReadProbeError({ phase: "response" }))
        )
        if (receipt.parentPid !== owned.process.pid) return yield* new LiveReadProbeError({ phase: "pair" })
        owned.process.stdin.end()
        const suffix = yield* Effect.tryPromise({
          try: () => incoming.next(),
          catch: () => new LiveReadProbeError({ phase: "pair" })
        }).pipe(Effect.timeout("5 seconds"))
        if (!suffix.done) return yield* new LiveReadProbeError({ phase: "pair" })
        yield* owned.exited
        return receipt
      }),
    (streams) =>
      Effect.sync(() => {
        streams.output.close()
        streams.diagnostics.close()
      })
  )
export const observeLiveReadPair = Effect.fn("observeLiveReadPair")(function* (
  input: LiveReadPairInput,
  environment: LiveProbeEnvironment,
  executable: LiveReadPairInput["bundle"]
) {
  const attachment = yield* readResidentAttachmentEnvelope(input.attachment)
  const reader = (host: LiveReadHostInput["host"], target: LiveReadHostInput["target"]) =>
    Schema.encodeEffect(Schema.fromJsonString(LiveReadHostInput))({
      bundle: input.bundle,
      attachment: input.attachment,
      target,
      host,
      generation: attachment.identity.generation
    })
  const first = yield* reader("first", input.targets[0])
  const second = yield* reader("second", input.targets[1])
  return yield* withLiveProbeChild([executable, "parent", first], environment, (left) =>
    withLiveProbeChild([executable, "parent", second], environment, (right) =>
      Effect.gen(function* () {
        const readers = yield* Effect.all([receive(left), receive(right)], { concurrency: "unbounded" })
        const [a, b] = readers
        if (a.host !== "first" || b.host !== "second" || a.parentPid === b.parentPid || a.adapterPid === b.adapterPid)
          return yield* new LiveReadProbeError({ phase: "pair" })
        for (const [receipt, target] of [
          [a, input.targets[0]],
          [b, input.targets[1]]
        ] satisfies ReadonlyArray<readonly [LiveReadHostReceipt, LiveReadHostInput["target"]]>) {
          if (
            receipt.generation !== attachment.identity.generation ||
            receipt.target.project !== target.project ||
            receipt.target.name !== target.name
          )
            return yield* new LiveReadProbeError({ phase: "pair" })
        }
        return LiveReadPairReceipt.make({
          mode: "manual",
          protocol: "2026-07-28",
          readers,
          parentExits: [0, 0],
          backendRetirement: "not-requested"
        })
      })
    )
  )
})
