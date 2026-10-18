import * as fs from "node:fs/promises"
import { Effect, Schema } from "effect"

import { currentPosixOwner, inspectPrivateDirectory } from "../src/resident/protected-path.js"
import type { openKernelReapedEvents } from "../test/helpers/kernel-reaped-events.js"
import {
  resolveLiveReadProtocol,
  type LiveProbeEnvironment,
  type ManagedLiveReadPairInput,
  ManagedLiveReadHostInput,
  ManagedLiveReadPairReceipt,
  LiveReadProbeError
} from "./resident-live-read-contract.js"
import { probeIo, withLiveProbeChild } from "./resident-live-read-process.js"
import { receiveLiveReader } from "./resident-live-read-pair.js"

export const observeManagedLiveReadPair = Effect.fn("observeManagedLiveReadPair")(function* (
  input: ManagedLiveReadPairInput,
  environment: LiveProbeEnvironment,
  executable: ManagedLiveReadPairInput["bundle"],
  kernel: ReturnType<typeof openKernelReapedEvents>
) {
  yield* inspectPrivateDirectory(input.directory, yield* currentPosixOwner).pipe(
    Effect.mapError(() => new LiveReadProbeError({ phase: "ownership" }))
  )
  if ((yield* probeIo("ownership", () => fs.readdir(input.directory))).length !== 0)
    return yield* new LiveReadProbeError({ phase: "ownership" })
  const reader = (
    host: ManagedLiveReadHostInput["host"],
    target: ManagedLiveReadHostInput["target"],
    client: ManagedLiveReadHostInput["client"]
  ) =>
    Schema.encodeEffect(Schema.fromJsonString(ManagedLiveReadHostInput))({
      ...(client === undefined ? {} : { client }),
      bundle: input.bundle,
      protocol: resolveLiveReadProtocol(input.protocol),
      directory: input.directory,
      host,
      target
    })
  const first = yield* reader("first", input.targets[0], input.clients?.[0])
  const second = yield* reader("second", input.targets[1], input.clients?.[1])
  const readers = yield* withLiveProbeChild([executable, "managed-parent", first], environment, (left) =>
    withLiveProbeChild([executable, "managed-parent", second], environment, (right) =>
      Effect.all([receiveLiveReader(left), receiveLiveReader(right)], { concurrency: "unbounded" })
    )
  )
  const [a, b] = readers
  if (
    a.mode !== "managed" ||
    b.mode !== "managed" ||
    a.host !== "first" ||
    b.host !== "second" ||
    a.parentPid === b.parentPid ||
    a.adapterPid === b.adapterPid ||
    a.generation !== b.generation ||
    a.backendProcessId !== b.backendProcessId
  )
    return yield* new LiveReadProbeError({ phase: "pair" })
  for (const { receipt, target } of [
    { receipt: a, target: input.targets[0] },
    { receipt: b, target: input.targets[1] }
  ]) {
    if (receipt.target.project !== target.project || receipt.target.name !== target.name)
      return yield* new LiveReadProbeError({ phase: "pair" })
  }
  const backendExit = yield* Effect.tryPromise({
    try: () => kernel.wait(a.backendProcessId),
    catch: () => new LiveReadProbeError({ phase: "retirement" })
  })
  if (backendExit.exitCode !== 0 || (yield* probeIo("retirement", () => fs.readdir(input.directory))).length !== 0)
    return yield* new LiveReadProbeError({ phase: "retirement" })
  return ManagedLiveReadPairReceipt.make({
    mode: "managed",
    protocol: resolveLiveReadProtocol(input.protocol),
    readers: [a, b],
    parentExits: [0, 0],
    backendRetirement: "confirmed",
    backendExit: { processId: backendExit.processId, exitCode: 0 },
    privateStateRemoved: true
  })
})
