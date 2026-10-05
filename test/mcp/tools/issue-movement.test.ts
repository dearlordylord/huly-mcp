import { NodeServices } from "@effect/platform-node"
import { it } from "@effect/vitest"
import { Ajv } from "ajv"
import { Effect } from "effect"
import { expect } from "vitest"

import { cliCommandCatalog } from "../../../packages/huly-cli/src/catalog.js"
import { parseCliCommandLine } from "../../../packages/huly-cli/src/cli-options.js"
import { buildCliInvocation } from "../../../packages/huly-cli/src/input.js"
import { HulyClient } from "../../../src/huly/client.js"
import { HulyStorageClient } from "../../../src/huly/storage.js"
import { issueTools } from "../../../src/mcp/tools/issues.js"
import { assertExists } from "../../../src/utils/assertions.js"
import { movementFixture, movementIssue, threeLevelMovementFixture } from "../../helpers/movement.js"

const tool = assertExists(issueTools.find((entry) => entry.name === "move_issue"))
const ajv = new Ajv({ strict: false })
const accepts = ajv.compile(tool.inputSchema)
const inputFor = (destination: unknown) => ({ issue: movementIssue("root").identifier, destination })

for (const destination of [
  { project: "TEST" },
  { parent: movementIssue("destination").identifier },
  { project: "TEST", parent: movementIssue("destination").identifier },
  { parent: null }
]) {
  it.effect(`MCP discovery, call and CLI agree for ${JSON.stringify(destination)}`, () =>
    Effect.gen(function* () {
      expect(accepts(inputFor(destination))).toBe(true)
      const tree = threeLevelMovementFixture()
      const fixture = movementFixture(tree.issues)
      const client = yield* HulyClient.pipe(Effect.provide(fixture.layer))
      const storage = yield* HulyStorageClient.pipe(Effect.provide(HulyStorageClient.testLayer({})))
      const response = yield* Effect.promise(() => tool.handler(inputFor(destination), client, storage))
      expect(response.isError).not.toBe(true)
      expect(JSON.stringify(response)).toContain('"completed"')
      const parsed = yield* parseCliCommandLine(tool, cliCommandCatalog.move_issue, [
        movementIssue("root").identifier,
        "--destination",
        JSON.stringify(destination)
      ]).pipe(Effect.provide(NodeServices.layer))
      const invocation = yield* buildCliInvocation(tool, cliCommandCatalog.move_issue, parsed).pipe(
        Effect.provide(NodeServices.layer)
      )
      expect(invocation.input).toEqual(inputFor(destination))
      const repeat = yield* tool.operation.execute(invocation.input, client, storage)
      expect(repeat.result).toMatchObject({ outcome: "no-op", changed: false })
    })
  )
}

it.effect("MCP discovery excludes empty destinations and legacy contracts; calls refuse resolutions before no-op", () =>
  Effect.gen(function* () {
    expect(accepts(inputFor({}))).toBe(false)
    expect(accepts({ project: "TEST", identifier: "TEST-root", newParent: null })).toBe(false)
    const fixture = movementFixture([movementIssue("root")])
    const client = yield* HulyClient.pipe(Effect.provide(fixture.layer))
    const storage = yield* HulyStorageClient.pipe(Effect.provide(HulyStorageClient.testLayer({})))
    const response = yield* Effect.promise(() =>
      tool.handler({ ...inputFor({ parent: null }), resolutions: [] }, client, storage)
    )
    expect(JSON.stringify(response)).toContain("Omit resolutions")
    expect(fixture.writes).toEqual([])
    expect(tool.description).toContain("Cross-project movement supports complete compatible trees")
    expect(tool.description).toContain("parent: null")
    expect(tool.description).toContain("stable IDs")
  })
)
