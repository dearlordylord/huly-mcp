import { NodeRuntime, NodeStdio } from "@effect/platform-node"
import { Effect, Schema, Stdio, Stream } from "effect"

import { ResidentPackagePath } from "../src/resident/managed-contract.js"
import {
  LiveProbeEnvironment,
  LiveReadHostInput,
  LiveReadHostReceipt,
  AnyLiveReadHostReceipt,
  ManagedLiveReadHostInput,
  ManagedLiveReadPairInput,
  ManagedLiveReadPairReceipt,
  LiveReadPairInput,
  LiveReadPairReceipt,
  LiveReadProbeError,
  LiveReadProbeDiagnostic
} from "./resident-live-read-contract.js"
import { observeLiveResidentReads } from "./resident-live-read-host.js"
import { observeManagedLiveReadPair } from "./resident-live-managed-pair.js"
import { observeLiveReadPair } from "./resident-live-read-pair.js"
import { openKernelReapedEvents, ReapedEventsFd } from "../test/helpers/kernel-reaped-events.js"

const NODE_ARGUMENT_OFFSET = 2
const Input = Schema.Union([
  Schema.Tuple([Schema.Literal("pair"), Schema.fromJsonString(LiveReadPairInput)]),
  Schema.Tuple([Schema.Literal("parent"), Schema.fromJsonString(LiveReadHostInput)]),
  Schema.Tuple([Schema.Literal("managed-pair"), Schema.fromJsonString(ManagedLiveReadPairInput)]),
  Schema.Tuple([Schema.Literal("managed-parent"), Schema.fromJsonString(ManagedLiveReadHostInput)])
])
NodeRuntime.runMain(
  Effect.gen(function* () {
    const snapshot = { ...process.env }
    yield* Schema.decodeUnknownEffect(Schema.Struct({ HULY_TOOL_MODE: Schema.Literals(["native", "proxy", "auto"]) }))(
      snapshot
    )
    const environment = yield* Schema.decodeUnknownEffect(LiveProbeEnvironment)(
      Object.fromEntries(Object.entries(snapshot).filter(([, value]) => value !== undefined))
    )
    const input = yield* Schema.decodeUnknownEffect(Input)(process.argv.slice(NODE_ARGUMENT_OFFSET))
    const output =
      input[0] === "parent" || input[0] === "managed-parent"
        ? yield* Effect.raceFirst(
            observeLiveResidentReads(
              input[1],
              environment,
              yield* Schema.decodeUnknownEffect(LiveReadHostReceipt.fields.parentPid)(process.pid)
            ),
            Stdio.Stdio.use((stdio) => Stream.runDrain(stdio.stdin)).pipe(
              Effect.andThen(Effect.fail(new LiveReadProbeError({ phase: "cleanup" })))
            )
          ).pipe(
            Effect.flatMap((receipt) =>
              Schema.encodeEffect(Schema.fromJsonString(AnyLiveReadHostReceipt))(receipt).pipe(
                Effect.mapError(() => new LiveReadProbeError({ phase: "response" }))
              )
            )
          )
        : yield* Effect.gen(function* () {
            const supervision = yield* Schema.decodeUnknownEffect(
              Schema.Struct({ platform: Schema.Literal("linux"), descriptor: ReapedEventsFd })
            )({ platform: process.platform, descriptor: snapshot["HULY_TEST_REAPED_FD"] })
            const executable = yield* Schema.decodeUnknownEffect(ResidentPackagePath)(process.argv[1])
            return yield* Effect.acquireUseRelease(
              Effect.try({
                try: () => openKernelReapedEvents(supervision.descriptor),
                catch: () => new LiveReadProbeError({ phase: "input" })
              }),
              (observer) =>
                Effect.gen(function* () {
                  if (input[0] === "managed-pair")
                    return yield* observeManagedLiveReadPair(input[1], environment, executable, observer)
                  return yield* observeLiveReadPair(input[1], environment, executable)
                }),
              (observer) => Effect.sync(() => observer.close())
            )
          }).pipe(
            Effect.flatMap((receipt) =>
              Schema.encodeEffect(
                Schema.fromJsonString(Schema.Union([LiveReadPairReceipt, ManagedLiveReadPairReceipt]))
              )(receipt).pipe(Effect.mapError(() => new LiveReadProbeError({ phase: "pair" })))
            )
          )
    yield* Effect.sync(() => process.stdout.write(`${output}\n`))
  }).pipe(
    Effect.provide(NodeStdio.layer),
    Effect.mapError((error) =>
      error instanceof LiveReadProbeError ? error : new LiveReadProbeError({ phase: "input" })
    ),
    Effect.tapError((error) =>
      Schema.encodeEffect(Schema.fromJsonString(LiveReadProbeDiagnostic))({
        kind: "resident-live-read-failure",
        phase: error.phase
      }).pipe(
        Effect.orDie,
        Effect.flatMap((line) => Effect.sync(() => process.stderr.write(`${line}\n`)))
      )
    )
  ),
  { disableErrorReporting: true }
)
