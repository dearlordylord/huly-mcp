import { Socket } from "node:net"
import { createInterface } from "node:readline"
import { Effect, Schema } from "effect"

import { ResidentRegistryEnvelope } from "../../src/resident/managed-contract.js"

const FIRST_EXTRA_DESCRIPTOR = 3
export const ReapedEventsFd = Schema.NumberFromString.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(FIRST_EXTRA_DESCRIPTOR)
).pipe(Schema.brand("ReapedEventsFd"))
export type ReapedEventsFd = Schema.Schema.Type<typeof ReapedEventsFd>
export const KernelOwnedExit = Schema.Struct({
  processId: ResidentRegistryEnvelope.fields.diagnostics.fields.processId,
  exitCode: Schema.Int
})
export type KernelOwnedExit = Schema.Schema.Type<typeof KernelOwnedExit>
const MAX_OBSERVED_EXITS = 32
const RETIREMENT_BOUND = 7_000
const LEASE_EXPIRY_BOUND = 35_000

// The optional supervisor pipe reports waitpid results for its actual kernel-owned children.
export const openKernelReapedEvents = (fd: ReapedEventsFd) => {
  const input = new Socket({ fd, readable: true, writable: false })
  const lines = createInterface({ input })
  const incoming = lines[Symbol.asyncIterator]()
  const exits = new Map<KernelOwnedExit["processId"], KernelOwnedExit>()
  const waitForExit = (processId: KernelOwnedExit["processId"], bound: number) =>
    Effect.runPromise(
      Effect.promise(async () => {
        while (true) {
          const known = exits.get(processId)
          if (known !== undefined) return known
          const next = await incoming.next()
          if (next.done) throw new Error("Owned-exit observer ended before retirement evidence")
          const observed = Schema.decodeUnknownSync(Schema.fromJsonString(KernelOwnedExit))(next.value)
          if (exits.size === MAX_OBSERVED_EXITS) throw new Error("Owned-exit observer capacity exceeded")
          exits.set(observed.processId, observed)
        }
      }).pipe(Effect.timeout(bound))
    )
  return {
    wait: (processId: KernelOwnedExit["processId"]) => waitForExit(processId, RETIREMENT_BOUND),
    waitForLeaseExpiry: (processId: KernelOwnedExit["processId"]) => waitForExit(processId, LEASE_EXPIRY_BOUND),
    close: () => {
      lines.close()
      input.destroy()
    }
  }
}
