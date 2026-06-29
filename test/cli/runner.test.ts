import { NodeContext } from "@effect/platform-node"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import type { ClientBundle } from "../../src/mcp/server.js"

import { cliCommandCatalog, type CliToolName } from "../../packages/huly-cli/src/catalog.js"
import { parseCliCommandLine } from "../../packages/huly-cli/src/cli-options.js"
import { type CliRunnerPorts, runCliTool, runCliToolWithPorts } from "../../packages/huly-cli/src/runner.js"
import { operationRegistry } from "../../src/mcp/tools/index.js"
import type { ToolOperationSuccess } from "../../src/mcp/tools/registry.js"

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- port fixture is never dereferenced by the fake operation executor.
const emptyBundle = {} as ClientBundle

interface RunnerObservation {
  readonly downloads: Array<{
    readonly attachmentIdField: string
    readonly output: string
    readonly result: ToolOperationSuccess
  }>
  readonly rendered: Array<ToolOperationSuccess>
}

const makePorts = (
  result: ToolOperationSuccess,
  observation: RunnerObservation
): CliRunnerPorts => ({
  downloadAttachment: (_bundle, success, attachmentIdField, output) =>
    Effect.sync(() => {
      observation.downloads.push({ attachmentIdField, output, result: success })
    }),
  getOperation: (toolName) => {
    const operation = operationRegistry.getOperation(toolName)
    return {
      ...operation,
      execute: () => Effect.succeed(result)
    }
  },
  renderSuccess: (success) =>
    Effect.sync(() => {
      observation.rendered.push(success)
    }),
  useClientBundle: (use) => use(emptyBundle)
})

const parse = (
  toolName: CliToolName,
  raw: ReadonlyArray<string>
) =>
  parseCliCommandLine(
    operationRegistry.getOperation(toolName),
    cliCommandCatalog[toolName],
    raw
  )

const run = (
  toolName: CliToolName,
  raw: ReadonlyArray<string>,
  ports: CliRunnerPorts
): Promise<void> =>
  Effect.runPromise(
    Effect.gen(function*() {
      const parsed = yield* parse(toolName, raw)
      yield* runCliToolWithPorts(ports, toolName, parsed)
    }).pipe(Effect.provide(NodeContext.layer))
  )

const rejected = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise
    throw new Error("Expected promise to reject.")
  } catch (error) {
    return error
  }
}

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error)

describe("CLI runner", () => {
  it("runs an operation through injected ports and renders the result", async () => {
    const result = { result: { projects: [{ name: "Huly" }] }, warnings: [] }
    const observation = { downloads: [], rendered: [] }

    await run("list_projects", ["--json"], makePorts(result, observation))

    expect(observation.rendered).toEqual([result])
    expect(observation.downloads).toEqual([])
  })

  it("enforces destructive confirmation before opening clients", async () => {
    const result = { result: { deleted: true }, warnings: [] }
    const observation = { downloads: [], rendered: [] }
    const error = await rejected(run("delete_comment", ["--comment-id", "comment"], makePorts(result, observation)))

    expect(errorMessage(error)).toContain("comments delete requires --yes")
    expect(observation.rendered).toEqual([])
  })

  it("enforces destructive operation annotations before opening clients", async () => {
    const result = { result: { deleted: true }, warnings: [] }
    const observation = { downloads: [], rendered: [] }
    const error = await rejected(run("unschedule_todo", [], makePorts(result, observation)))

    expect(errorMessage(error)).toContain("planner todos unschedule requires --yes")
    expect(observation.rendered).toEqual([])

    await run("unschedule_todo", ["--yes"], makePorts(result, observation))

    expect(observation.rendered).toEqual([result])
  })

  it("does not require confirmation for non-destructive operation annotations", async () => {
    const result = { result: { ok: true }, warnings: [] }
    const observation = { downloads: [], rendered: [] }

    await run("pin_attachment", ["attachment-1", "true"], makePorts(result, observation))

    expect(observation.rendered).toEqual([result])
  })

  it("rejects unsupported --output before opening clients", async () => {
    const result = { result: { issues: [] }, warnings: [] }
    const observation = { downloads: [], rendered: [] }
    const error = await rejected(run("list_issues", ["--output", "issues.json"], makePorts(result, observation)))

    expect(errorMessage(error)).toContain("issues list does not support --output")
    expect(observation.rendered).toEqual([])
  })

  it("uses catalog file-output metadata for attachment downloads", async () => {
    const result = {
      result: { attachmentId: "attachment-1", downloadUrl: "https://example.invalid/file" },
      warnings: []
    }
    const observation = { downloads: [], rendered: [] }

    await run("download_attachment", ["attachment-1", "--output", "artifact.bin"], makePorts(result, observation))

    expect(observation.downloads).toEqual([{
      attachmentIdField: "attachmentId",
      output: "artifact.bin",
      result
    }])
    expect(observation.rendered).toEqual([result])
  })

  it("renders attachment metadata without writing bytes when --output is omitted", async () => {
    const result = {
      result: { attachmentId: "attachment-1", downloadUrl: "https://example.invalid/file" },
      warnings: []
    }
    const observation = { downloads: [], rendered: [] }

    await run("download_attachment", ["attachment-1"], makePorts(result, observation))

    expect(observation.downloads).toEqual([])
    expect(observation.rendered).toEqual([result])
  })

  it("maps operation failures into CLI runtime errors", async () => {
    const observation = { downloads: [], rendered: [] }
    const ports: CliRunnerPorts = {
      ...makePorts({ result: {}, warnings: [] }, observation),
      getOperation: operationRegistry.getOperation
    }
    const error = await rejected(run("list_projects", ["--input-json", "{\"unexpected\":true}"], ports))

    expect(errorMessage(error)).toContain("An unexpected error occurred")
    expect(observation.rendered).toEqual([])
  })

  it("keeps default runner preflight errors before client construction", async () => {
    const parsed = await Effect.runPromise(
      parse("list_issues", ["--output", "issues.json"]).pipe(Effect.provide(NodeContext.layer))
    )
    const error = await rejected(Effect.runPromise(runCliTool("list_issues", parsed)))

    expect(errorMessage(error)).toContain("issues list does not support --output")
  })
})
