import { Schema } from "effect"

import { NonEmptyString } from "../src/domain/schemas/shared.js"
import { addSuccessfulOutputLines, OutputLineCount } from "./quality-output-budget.js"
import { Milliseconds, runBoundedCommand } from "./run-bounded-command.js"

const MILLISECONDS_PER_SECOND = 1_000
const MAXIMUM_SUCCESSFUL_OUTPUT_LINE_COUNT = 300
const SECOND = Milliseconds.make(MILLISECONDS_PER_SECOND)
const SECONDS_PER_MINUTE = 60
const TWO_MINUTE_COUNT = 2
const THREE_MINUTE_COUNT = 3
const FIVE_MINUTE_COUNT = 5
const MINUTE = Milliseconds.make(SECONDS_PER_MINUTE * SECOND)
const TWO_MINUTES = Milliseconds.make(TWO_MINUTE_COUNT * MINUTE)
const THREE_MINUTES = Milliseconds.make(THREE_MINUTE_COUNT * MINUTE)
const FIVE_MINUTES = Milliseconds.make(FIVE_MINUTE_COUNT * MINUTE)
const maximumSuccessfulOutputLines = OutputLineCount.make(MAXIMUM_SUCCESSFUL_OUTPUT_LINE_COUNT)
const PnpmEntryPoint = NonEmptyString.annotate({
  identifier: "PnpmEntryPoint",
  description: "Executable path injected by pnpm for nested quality-gate stages."
})
const pnpmEntryPoint = Schema.decodeUnknownSync(PnpmEntryPoint)(process.env.npm_execpath)

interface QualityGate {
  readonly args: ReadonlyArray<string>
  readonly name: string
  readonly timeout: Milliseconds
}

const gates: ReadonlyArray<QualityGate> = [
  { args: ["verify:effect-cohort"], name: "Effect dependency cohort", timeout: MINUTE },
  { args: ["build"], name: "build", timeout: TWO_MINUTES },
  { args: ["typecheck"], name: "TypeScript and Effect diagnostics", timeout: TWO_MINUTES },
  { args: ["verify-schema-boundaries"], name: "schema boundaries", timeout: MINUTE },
  { args: ["circular"], name: "dependency cycles", timeout: MINUTE },
  { args: ["complexity"], name: "cyclomatic complexity", timeout: MINUTE },
  { args: ["verify-registry-metadata"], name: "registry metadata", timeout: MINUTE },
  { args: ["verify-registry-schema"], name: "registry schema", timeout: MINUTE },
  { args: ["verify:effect4-oracle:built"], name: "Effect migration behavioral oracle", timeout: THREE_MINUTES },
  { args: ["verify-cli-integration-coverage"], name: "CLI integration coverage", timeout: TWO_MINUTES },
  { args: ["verify-sdk-parity"], name: "SDK parity", timeout: MINUTE },
  { args: ["verify-readme"], name: "README synchronization", timeout: MINUTE },
  { args: ["verify-cli-readme"], name: "CLI README synchronization", timeout: TWO_MINUTES },
  { args: ["verify-cli-skill"], name: "CLI Agent Skill synchronization", timeout: MINUTE },
  { args: ["verify-cli-skill-package"], name: "CLI Agent Skill package smoke", timeout: TWO_MINUTES },
  { args: ["verify-cli-package-closure"], name: "CLI package dependency closure", timeout: MINUTE },
  { args: ["lint"], name: "lint and duplication", timeout: TWO_MINUTES },
  { args: ["test:coverage"], name: "tests and coverage", timeout: FIVE_MINUTES }
]

let successfulOutputLines = OutputLineCount.make(0)

for (const gate of gates) {
  const result = await runBoundedCommand({
    args: [pnpmEntryPoint, ...gate.args],
    executable: process.execPath,
    name: `Quality gate '${gate.name}'`,
    timeoutMilliseconds: gate.timeout
  })
  successfulOutputLines = addSuccessfulOutputLines({
    currentOutputLines: successfulOutputLines,
    maximumOutputLines: maximumSuccessfulOutputLines,
    stageName: gate.name,
    stageOutputLines: result.outputLineCount
  })
}

console.log(`Quality gate emitted ${successfulOutputLines}/${maximumSuccessfulOutputLines} successful output lines.`)
