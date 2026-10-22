import type { Reporter, TestCase, TestModule } from "vitest/node"

const SLOW_MODULE_MILLISECONDS = 10_000
const MAXIMUM_SLOW_MODULE_REPORTS = 32
const MAXIMUM_ERROR_MESSAGE_CHARACTERS = 2_000

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
    const result = testCase.result()
    if (result.state !== "failed") return
    process.stderr.write(`Failed test: ${testCase.fullName}\n`)
    for (const error of result.errors)
      process.stderr.write(`${error.message?.slice(0, MAXIMUM_ERROR_MESSAGE_CHARACTERS) ?? "No error message"}\n`)
  }
}
