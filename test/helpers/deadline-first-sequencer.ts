import { basename } from "node:path"
import { BaseSequencer, type TestSpecification } from "vitest/node"

const longProcessWaits = new Set([
  "native-backend-process.test.ts",
  "managed-live-read-pair-process.test.ts",
  "output-isolation-process.test.ts"
])
const waitPriority = (file: string): number => {
  const name = basename(file)
  if (name === "managed-last-adapter-expiry-process.test.ts") return 2
  return longProcessWaits.has(name) ? 1 : 0
}

// Cold CI has no duration cache. Start real kernel waits early without changing any cohort or deadline.
export class DeadlineFirstSequencer extends BaseSequencer {
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    const sorted = await super.sort(files)
    return sorted.toSorted((left, right) => {
      const cohort = left.project.config.sequence.groupOrder - right.project.config.sequence.groupOrder
      if (cohort !== 0) return cohort
      if (left.project.name !== right.project.name) return left.project.name < right.project.name ? -1 : 1
      return waitPriority(right.moduleId) - waitPriority(left.moduleId)
    })
  }
}
