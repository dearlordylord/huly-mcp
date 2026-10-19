import { expect, it } from "vitest"
import { runCapturedProcess } from "../../scripts/captured-process.js"

it("retains the child refusal receipt when stdin closes before all input is written", async () => {
  const result = await runCapturedProcess(
    process.execPath,
    ["-e", "process.stdin.destroy(); process.stderr.write('input refused\\n'); process.exit(2)"],
    {},
    "x".repeat(1000000)
  )
  expect(result).toEqual({ exitCode: 2, stderr: "input refused\n", stdout: "" })
})
