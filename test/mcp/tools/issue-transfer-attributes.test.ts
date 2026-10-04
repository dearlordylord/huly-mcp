import { MoveIssueResultSchema } from "../../../src/domain/schemas/issues-results.js"
import { NodeServices } from "@effect/platform-node"
import { it } from "@effect/vitest"
import { Ajv } from "ajv"
import { Effect, Schema } from "effect"
import { expect } from "vitest"
import { cliCommandCatalog } from "../../../packages/huly-cli/src/catalog.js"
import { parseCliCommandLine } from "../../../packages/huly-cli/src/cli-options.js"
import { buildCliInvocation } from "../../../packages/huly-cli/src/input.js"
import { HulyClient } from "../../../src/huly/client.js"
import { HulyStorageClient } from "../../../src/huly/storage.js"
import { issueTools } from "../../../src/mcp/tools/issues.js"
import { assertExists } from "../../../src/utils/assertions.js"
import { transferFixture } from "../../helpers/transfer.js"
import { sdkFixture } from "../../helpers/huly-sdk.js"

const tool = assertExists(issueTools.find((entry) => entry.name === "move_issue"))
const accepts = new Ajv({ strict: false }).compile(tool.inputSchema)
for (const transport of ["mcp", "cli"]) {
  it.effect(
    `${transport} discovers two conflicts and accepts a selective-clear retry from published schema and response`,
    () =>
      Effect.gen(function* () {
        const f = transferFixture()
        f.root.component = sdkFixture("missing-component")
        f.root.milestone = sdkFixture("missing-milestone")
        const client = yield* HulyClient.pipe(Effect.provide(f.layer))
        const storage = yield* HulyStorageClient.pipe(Effect.provide(HulyStorageClient.testLayer({})))
        const first = yield* tool.operation.execute(f.input, client, storage)
        const blocked = Schema.decodeUnknownSync(MoveIssueResultSchema)(first.result)
        if (blocked.outcome !== "blocked" || blocked.conflicts === undefined)
          throw new Error("Expected actionable conflicts")
        const retry = {
          ...blocked.nextCall,
          resolutions: blocked.conflicts
            .filter((conflict) => "field" in conflict)
            .map((conflict) => ({ issueId: conflict.issueId, field: conflict.field, from: conflict.from, to: null }))
        }
        expect(accepts(retry)).toBe(true)
        expect(f.state.allocated).toBe(0)
        if (transport === "cli") {
          const parsed = yield* parseCliCommandLine(tool, cliCommandCatalog.move_issue, [
            f.root._id,
            "--destination",
            JSON.stringify(retry.destination),
            "--resolutions",
            JSON.stringify(retry.resolutions)
          ]).pipe(Effect.provide(NodeServices.layer))
          const invocation = yield* buildCliInvocation(tool, cliCommandCatalog.move_issue, parsed).pipe(
            Effect.provide(NodeServices.layer)
          )
          expect(invocation.input).toEqual(retry)
          const completed = yield* tool.operation.execute(invocation.input, client, storage)
          expect(completed.result).toMatchObject({
            outcome: "completed",
            attributeChanges: [
              { field: "component", to: null },
              { field: "milestone", to: null }
            ]
          })
        } else {
          const response = yield* Effect.promise(() => tool.handler(retry, client, storage))
          expect(response.isError).not.toBe(true)
          expect(JSON.stringify(response)).toContain('"completed"')
        }
        expect(f.root.component).toBeNull()
        expect(f.root.milestone).toBeNull()
      })
  )
}
