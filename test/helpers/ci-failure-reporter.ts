import type { Reporter, TestCase } from "vitest/node"

// The gate may terminate a campaign before Vitest prints its final failure summary.
export default class CiFailureReporter implements Reporter {
  onTestCaseResult(testCase: TestCase): void {
    if (testCase.result().state === "failed") process.stderr.write(`Failed test: ${testCase.fullName}\n`)
  }
}
