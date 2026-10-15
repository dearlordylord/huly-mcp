import { NodeServices } from "@effect/platform-node"
import { Effect, Layer, Logger, References, Redacted, Schema } from "effect"
import { describe, expect, it } from "vitest"
import type { ClientBundle } from "../../src/mcp/server.js"

import { cliCommandCatalog, type CliToolName } from "../../packages/huly-cli/src/catalog.js"
import { parseCliCommandLine } from "../../packages/huly-cli/src/cli-options.js"
import { LocalCliService } from "../../packages/huly-cli/src/local-commands.js"
import {
  closeCliClientBundle,
  type CliRunnerPorts,
  runCliTool,
  runCliToolWithPorts
} from "../../packages/huly-cli/src/runner.js"
import { McpImageContentSchema } from "../../src/domain/schemas/attachments.js"
import { operationRegistry } from "../../src/mcp/tools/index.js"
import type { ToolOperationSuccess } from "../../src/mcp/tools/registry.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- port fixture is never dereferenced by the fake operation executor.
const emptyBundle = {} as ClientBundle

const localCliTestLayer = Layer.succeed(LocalCliService, {
  promptSecret: () => Effect.die("secret prompt is not used by runner tests"),
  platform: "linux",
  checkConnection: () => Effect.void,
  readTokenStdin: () => Effect.succeed(Redacted.make("stdin-token")),
  authenticate: () => Effect.die("authenticate is not used by runner tests"),
  environment: {},
  prompt: () => Effect.die("prompt is not used by runner tests"),
  store: {
    paths: { credentials: "credentials.json", directory: ".", profiles: "profiles.json" },
    readCredentials: () => Effect.succeed({ version: 1, tokens: {} }),
    readProfiles: () => Effect.succeed({ version: 1, profiles: {} }),
    writeCredentials: () => Effect.void,
    writeProfiles: () => Effect.void
  }
})

interface RunnerObservation {
  readonly downloads: Array<{
    readonly attachmentIdField: string
    readonly output: string
    readonly result: ToolOperationSuccess
  }>
  readonly rendered: Array<ToolOperationSuccess>
  readonly telemetry: Array<{ readonly event: "session_start" | "tool_called" | "shutdown"; readonly props?: unknown }>
}

const makePorts = (result: ToolOperationSuccess, observation: RunnerObservation): CliRunnerPorts => ({
  downloadAttachment: (_bundle, success, attachmentIdField, output) =>
    Effect.sync(() => {
      observation.downloads.push({ attachmentIdField, output, result: success })
    }),
  getOperation: (toolName) => {
    const operation = operationRegistry.getOperation(toolName)
    return { ...operation, execute: () => Effect.succeed(result) }
  },
  renderSuccess: (success) =>
    Effect.sync(() => {
      observation.rendered.push(success)
    }),
  writeImage: (_success, output) =>
    Effect.sync(() => {
      observation.downloads.push({ attachmentIdField: "image", output, result })
    }),
  useClientBundle: (use) => use(emptyBundle)
})

const parse = (toolName: CliToolName, raw: ReadonlyArray<string>) =>
  parseCliCommandLine(operationRegistry.getOperation(toolName), cliCommandCatalog[toolName], raw)

const run = (
  toolName: CliToolName,
  raw: ReadonlyArray<string>,
  ports: CliRunnerPorts,
  observation: RunnerObservation
): Promise<void> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const parsed = yield* parse(toolName, raw)
      yield* runCliToolWithPorts(ports, toolName, parsed, undefined, "password")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          NodeServices.layer,
          TelemetryService.testLayer({
            sessionStart: (props) => {
              observation.telemetry.push({ event: "session_start", props })
            },
            shutdown: () => {
              observation.telemetry.push({ event: "shutdown" })
              return Promise.resolve()
            },
            toolCalled: (props) => {
              observation.telemetry.push({ event: "tool_called", props })
            }
          })
        )
      )
    )
  )

const rejected = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise
    throw new Error("Expected promise to reject.")
  } catch (error) {
    return error
  }
}

describe("CLI client cleanup", () => {
  it("awaits successful close", async () => {
    const state = { closed: false }

    await Effect.runPromise(
      closeCliClientBundle(() => {
        state.closed = true
        return Promise.resolve()
      })
    )

    expect(state.closed).toBe(true)
  })

  it("bounds a stuck close and emits a static operator diagnostic", async () => {
    const messages: Array<unknown> = []
    const logger = Logger.make<unknown, void>((entry) => messages.push(entry.message))

    await Effect.runPromise(
      closeCliClientBundle(() => new Promise<void>(() => {}), 0).pipe(
        Effect.provide(Logger.layer([logger])),
        Effect.provideService(References.MinimumLogLevel, "Info")
      )
    )

    expect(messages).toEqual([["CLI Huly client cleanup timed out"]])
  })

  it("sanitizes close failures", async () => {
    const messages: Array<unknown> = []
    const logger = Logger.make<unknown, void>((entry) => messages.push(entry.message))

    await Effect.runPromise(
      closeCliClientBundle(() => Promise.reject(new Error("secret close detail"))).pipe(
        Effect.provide(Logger.layer([logger])),
        Effect.provideService(References.MinimumLogLevel, "Info")
      )
    )

    expect(messages).toEqual([["CLI Huly client cleanup failed"]])
  })
})

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))

describe("CLI runner", () => {
  it("runs an operation through injected ports and renders the result", async () => {
    const result = { result: { projects: [{ name: "Huly" }] }, warnings: [] }
    const observation = { downloads: [], rendered: [], telemetry: [] }

    await run("list_projects", ["--json"], makePorts(result, observation), observation)

    expect(observation.rendered).toEqual([result])
    expect(observation.downloads).toEqual([])
    expect(observation.telemetry).toEqual([
      {
        event: "session_start",
        props: {
          authMethod: "password",
          toolCount: Object.keys(cliCommandCatalog).length,
          toolsets: null,
          transport: "cli"
        }
      },
      {
        event: "tool_called",
        props: {
          durationMs: expect.any(Number),
          inputBytes: 2,
          outputBytes: 30,
          status: "success",
          toolName: "list_projects"
        }
      },
      { event: "shutdown" }
    ])
  })

  it("enforces destructive confirmation before opening clients", async () => {
    const result = { result: { deleted: true }, warnings: [] }
    const observation = { downloads: [], rendered: [], telemetry: [] }
    const error = await rejected(
      run("delete_comment", ["--comment-id", "comment"], makePorts(result, observation), observation)
    )

    expect(errorMessage(error)).toContain("comments delete requires --yes")
    expect(observation.rendered).toEqual([])
    expect(observation.telemetry).toContainEqual({
      event: "tool_called",
      props: {
        durationMs: expect.any(Number),
        errorTag: "CliRuntimeError",
        inputBytes: 23,
        status: "error",
        toolName: "delete_comment"
      }
    })
  })

  it("enforces destructive operation annotations before opening clients", async () => {
    const result = { result: { deleted: true }, warnings: [] }
    const observation = { downloads: [], rendered: [], telemetry: [] }
    const error = await rejected(run("unschedule_todo", [], makePorts(result, observation), observation))

    expect(errorMessage(error)).toContain("planner todos unschedule requires --yes")
    expect(observation.rendered).toEqual([])

    await run("unschedule_todo", ["--yes"], makePorts(result, observation), observation)

    expect(observation.rendered).toEqual([result])
  })

  it("does not require confirmation for non-destructive operation annotations", async () => {
    const result = { result: { ok: true }, warnings: [] }
    const observation = { downloads: [], rendered: [], telemetry: [] }

    await run("pin_attachment", ["attachment-1", "true"], makePorts(result, observation), observation)

    expect(observation.rendered).toEqual([result])
  })

  it("rejects unsupported --output before opening clients", async () => {
    const result = { result: { issues: [] }, warnings: [] }
    const observation = { downloads: [], rendered: [], telemetry: [] }
    const error = await rejected(
      run("list_issues", ["--output", "issues.json"], makePorts(result, observation), observation)
    )

    expect(errorMessage(error)).toContain("issues list does not support --output")
    expect(observation.rendered).toEqual([])
  })

  it("uses catalog file-output metadata for attachment downloads", async () => {
    const result = {
      result: { attachmentId: "attachment-1", downloadUrl: "https://example.invalid/file" },
      warnings: []
    }
    const observation = { downloads: [], rendered: [], telemetry: [] }

    await run(
      "download_attachment",
      ["attachment-1", "--output", "artifact.bin"],
      makePorts(result, observation),
      observation
    )

    expect(observation.downloads).toEqual([{ attachmentIdField: "attachmentId", output: "artifact.bin", result }])
    expect(observation.rendered).toEqual([result])
  })

  it("renders attachment metadata without writing bytes when --output is omitted", async () => {
    const result = {
      result: { attachmentId: "attachment-1", downloadUrl: "https://example.invalid/file" },
      warnings: []
    }
    const observation = { downloads: [], rendered: [], telemetry: [] }

    await run("download_attachment", ["attachment-1"], makePorts(result, observation), observation)

    expect(observation.downloads).toEqual([])
    expect(observation.rendered).toEqual([result])
  })

  it("writes MCP image content through the native CLI output policy", async () => {
    const result = {
      result: { attachmentId: "attachment-1", type: "image/png" },
      warnings: [],
      image: Schema.decodeUnknownSync(McpImageContentSchema)({ type: "image", data: "aW1hZ2U=", mimeType: "image/png" })
    }
    const observation = { downloads: [], rendered: [], telemetry: [] }

    await run(
      "read_attachment_content",
      ["attachment-1", "--output", "artifact.png"],
      makePorts(result, observation),
      observation
    )

    expect(observation.downloads).toEqual([{ attachmentIdField: "image", output: "artifact.png", result }])
    expect(observation.rendered).toEqual([result])
  })

  it("maps operation failures into CLI runtime errors", async () => {
    const observation = { downloads: [], rendered: [], telemetry: [] }
    const ports: CliRunnerPorts = {
      ...makePorts({ result: {}, warnings: [] }, observation),
      getOperation: operationRegistry.getOperation
    }
    const error = await rejected(run("list_projects", ["--input-json", '{"unexpected":true}'], ports, observation))

    expect(errorMessage(error)).toContain("An unexpected error occurred")
    expect(observation.rendered).toEqual([])
  })

  it("applies a profile default project only when the command accepts project and none was supplied", async () => {
    const observation = { downloads: [], rendered: [], telemetry: [] }
    const ports: CliRunnerPorts = {
      ...makePorts({ result: {}, warnings: [] }, observation),
      getOperation: (toolName) => {
        const operation = operationRegistry.getOperation(toolName)
        return { ...operation, execute: (input) => Effect.succeed({ result: input, warnings: [] }) }
      }
    }
    const parsed = await Effect.runPromise(parse("list_issues", []).pipe(Effect.provide(NodeServices.layer)))

    await Effect.runPromise(
      runCliToolWithPorts(ports, "list_issues", parsed, "HULY", "password").pipe(
        Effect.provide(Layer.merge(TelemetryService.testLayer(), localCliTestLayer))
      )
    )

    expect(observation.rendered).toEqual([{ result: { project: "HULY" }, warnings: [] }])
  })

  it("keeps default runner preflight errors before client construction", async () => {
    const parsed = await Effect.runPromise(
      parse("list_issues", ["--output", "issues.json"]).pipe(Effect.provide(NodeServices.layer))
    )
    const error = await rejected(
      Effect.runPromise(
        runCliTool("list_issues", parsed).pipe(
          Effect.provide(Layer.merge(TelemetryService.testLayer(), localCliTestLayer))
        )
      )
    )

    expect(errorMessage(error)).toContain("issues list does not support --output")
  })
})
