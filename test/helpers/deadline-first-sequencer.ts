import { basename } from "node:path"
import { BaseSequencer, type TestSpecification } from "vitest/node"

const LEASE_WAIT_PRIORITY = 2
const PORT_PROJECT_FIRST = -1
export const PORT_TEST_PROJECT = "ports"
const longProcessWaits = new Set([
  "native-backend-process.test.ts",
  "managed-live-read-pair-process.test.ts",
  "output-isolation-process.test.ts"
])
const waitPriority = (file: string): number => {
  const name = basename(file)
  if (name === "managed-last-adapter-expiry-process.test.ts") return LEASE_WAIT_PRIORITY
  return longProcessWaits.has(name) ? 1 : 0
}

// Start kernel waits first, then let port tests use workers while those waits remain outstanding.
export class DeadlineFirstSequencer extends BaseSequencer {
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const sorted = await super.sort(files)
    return sorted.toSorted((left, right) => {
      const cohort = left.project.config.sequence.groupOrder - right.project.config.sequence.groupOrder
      if (cohort !== 0) return cohort
      const waiting = waitPriority(right.moduleId) - waitPriority(left.moduleId)
      if (waiting !== 0) return waiting
      if (left.project.name === PORT_TEST_PROJECT && right.project.name !== PORT_TEST_PROJECT) return PORT_PROJECT_FIRST
      if (right.project.name === PORT_TEST_PROJECT && left.project.name !== PORT_TEST_PROJECT)
        return -PORT_PROJECT_FIRST
      return 0
    })
  }
}
