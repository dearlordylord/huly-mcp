import type { Reporter, TestCase, TestModule } from "vitest/node"

const SLOW_MODULE_MILLISECONDS = 10_000
const MAXIMUM_SLOW_MODULE_REPORTS = 32

// The gate may terminate a campaign before Vitest prints its final failure summary.
export default class CiFailureReporter implements Reporter {
  private remainingSlowReports = MAXIMUM_SLOW_MODULE_REPORTS

  onTestModuleEnd(testModule: TestModule): void {
    const duration = testModule.diagnostic().duration
    if (duration < SLOW_MODULE_MILLISECONDS || this.remainingSlowReports === 0) return
    this.remainingSlowReports--
    process.stderr.write(`Slow test module: ${testModule.relativeModuleId} ${Math.round(duration)}ms\n`)
  }

  onTestCaseResult(testCase: TestCase): void {
    if (testCase.result().state === "failed") process.stderr.write(`Failed test: ${testCase.fullName}\n`)
  }
}
