import { strict as assert } from "node:assert"
import { Effect, Result } from "effect"

import { requestResidentStop, type ResidentStopTarget } from "../../src/resident/operator-stop.js"
import type { KernelOwnedExit, openKernelReapedEvents } from "./kernel-reaped-events.js"

const CONTROL_BOUND = 5_000

// Both observations start together inside the existing seven-second owned-exit bound.
export const retireFunctionalResident = async (
  target: ResidentStopTarget,
  processId: KernelOwnedExit["processId"],
  kernel: Pick<ReturnType<typeof openKernelReapedEvents>, "wait">
): Promise<KernelOwnedExit> => {
  const [exitObservation, stopObservation] = await Promise.allSettled([
    kernel.wait(processId),
    Effect.runPromise(requestResidentStop(target).pipe(Effect.timeout(CONTROL_BOUND), Effect.result))
  ])
  if (exitObservation.status === "rejected") throw exitObservation.reason
  if (stopObservation.status === "rejected") throw stopObservation.reason
  const exit = exitObservation.value
  const stop = stopObservation.value
  assert.equal(exit.exitCode, 0)
  if (Result.isFailure(stop)) {
    // A buffered exact owned exit can precede control lookup after ordinary idle retirement.
    assert.ok("reason" in stop.failure && stop.failure.reason === "target-missing")
    process.stderr.write("Functional cleanup: exact owner exited before stop target lookup.\n")
  } else {
    assert.equal(stop.success.kind, "accepted")
  }
  return exit
}
