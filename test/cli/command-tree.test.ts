import { NodeServices } from "@effect/platform-node"
import { stripVTControlCharacters } from "node:util"
import { Effect, Layer, Option, Schema } from "effect"
import { describe, expect, it } from "vitest"

import { buildCommandDescriptorAtPath } from "../../packages/huly-cli/src/command-tree.js"
import { runEffectCli } from "../../packages/huly-cli/src/index.js"
import { LocalCliService } from "../../packages/huly-cli/src/local-commands.js"
import { renderCliHelp } from "../../packages/huly-cli/src/help.js"
import { CliCommandPath } from "../../packages/huly-cli/src/command-schema.js"
import { parseCliHelpRequest, type RenderedCliHelp } from "../../packages/huly-cli/src/help-schema.js"
import { TelemetryService } from "../../src/telemetry/telemetry.js"

const runCommand = (argv: ReadonlyArray<string>): Promise<void> =>
  Effect.runPromise(
    runEffectCli(argv).pipe(
      Effect.provide(Layer.mergeAll(NodeServices.layer, TelemetryService.testLayer(), LocalCliService.defaultLayer))
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

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))
const commandPath = Schema.decodeUnknownSync(CliCommandPath)
const parseHelpInput = (argv: ReadonlyArray<string>, terminalColumns: unknown) =>
  Effect.runSync(parseCliHelpRequest({ argv, terminalColumns, version: "test" }))
const parsedHelpRequest = (argv: ReadonlyArray<string>, terminalColumns: unknown = 80) =>
  parseHelpInput(argv, terminalColumns)
const renderedHelp = (argv: ReadonlyArray<string>, terminalColumns: unknown = 80): RenderedCliHelp =>
  Option.getOrThrow(Option.flatMap(parsedHelpRequest(argv, terminalColumns), renderCliHelp))

describe("CLI command tree", () => {
  it("renders progressive root help within the requested terminal width", () => {
    const help = renderedHelp(["--help"], 40)
    const booleanHelp = renderedHelp(["--help"], 120)

    expect(help).toBeDefined()
    expect(help).toContain("huly issues")
    expect(help).toContain("huly auth")
    expect(help).toContain("huly profile")
    expect(booleanHelp).toContain("--json[=true|false], --no-json")
    expect(booleanHelp).toContain("--yes[=true|false], --no-yes")
    expect(help).toContain("1 command")
    expect(help).not.toContain("issues labels add")
    expect(help.split("\n").every((line) => line.length <= 40)).toBe(true)
  })

  it("renders only immediate children in group help", () => {
    const help = renderedHelp(["issues", "--help"])

    expect(help).toContain("huly issues labels")
    expect(help).toContain("huly issues get")
    expect(help).not.toContain("huly issues labels add")
    expect(help.split("\n").every((line) => line.length <= 80)).toBe(true)
  })

  it("wraps long command descriptions under their aligned command", () => {
    const help = renderedHelp(["projects", "target-preferences", "--help"])

    expect(help).toContain("Create or update a project target")
    expect(help.split("\n").every((line) => line.length <= 80)).toBe(true)
  })

  it("renders complete terminal-safe leaf help", () => {
    const help = renderedHelp(["issues", "get", "--help"], 88)

    expect(help).toContain("huly issues get")
    expect(help).toContain("<project>")
    expect(help).toContain("<identifier>")
    expect(help).toContain("--json")
    expect(help).toContain("--json[=true|false], --no-json")
    expect(help).not.toContain("--project <value>")
    expect(help).not.toContain("--identifier <value>")
    expect(help).not.toContain("--output")
    expect(stripVTControlCharacters(help)).toBe(help)
    expect(help.split("\n").every((line) => line.length <= 88)).toBe(true)
  })

  it("renders schema descriptions and only behavior-supported file options", () => {
    const updateHelp = renderedHelp(["issues", "update", "--help"], 120)
    const attachmentHelp = renderedHelp(["attachments", "add-to-issue", "--help"], 120)
    const listHelp = renderedHelp(["issues", "list", "--help"], 120)

    expect(updateHelp).toContain("--title <value>")
    expect(updateHelp).toContain("New issue title")
    expect(updateHelp).toContain("--description-file <path>")
    expect(updateHelp).not.toContain("--output")
    expect(attachmentHelp).toContain("--data-base64-file <path>")
    const booleanSyntax = "--has-assignee[=true|false], --no-has-assignee"
    const booleanStart = listHelp.indexOf(booleanSyntax)
    const nextOption = listHelp.indexOf("\n  --", booleanStart + booleanSyntax.length)
    const booleanSection = listHelp.slice(booleanStart, nextOption)
    expect(booleanStart).toBeGreaterThanOrEqual(0)
    expect(booleanSection).toContain("Filter by assignee presence")
    expect(booleanSection).not.toContain("Pass null to clear the field")
  })

  it("parses help requests at the process boundary", () => {
    const request = Option.getOrThrow(parsedHelpRequest(["issues", "--help"], 72))

    expect(request.width).toBe(72)
    expect(Option.getOrThrow(renderCliHelp(request))).toContain("huly issues get")
  })

  it("normalizes missing and out-of-range terminal widths", () => {
    expect(Option.getOrThrow(parseHelpInput(["--help"], undefined)).width).toBe(100)
    expect(Option.getOrThrow(parsedHelpRequest(["--help"], -1)).width).toBe(100)
    expect(Option.getOrThrow(parsedHelpRequest(["--help"], 20)).width).toBe(20)
    expect(Option.getOrThrow(parsedHelpRequest(["--help"], 300)).width).toBe(160)
  })

  it.each([{ argv: [] }, { argv: ["issues"] }, { argv: ["issues", "", "value"] }])(
    "does not parse normal CLI invocation $argv as help",
    ({ argv }) => {
      expect(Option.isNone(parsedHelpRequest(argv))).toBe(true)
    }
  )

  it.each([{ argv: ["issues", "--json", "--help"] }, { argv: ["unknown", "--help"] }])(
    "delegates unsupported help request $argv to Effect CLI",
    ({ argv }) => {
      expect(Option.isNone(Option.flatMap(parsedHelpRequest(argv), renderCliHelp))).toBe(true)
    }
  )

  it("splits tokens that are wider than the terminal", () => {
    const help = renderedHelp(["--help"], 1)

    expect(help.split("\n").every((line) => line.length <= 1)).toBe(true)
  })

  it("supports the short root help flag", () => {
    expect(renderedHelp(["-h"])).toContain("huly issues")
  })

  it("does not build leaf descriptors for groups or unknown paths", () => {
    expect(Option.isNone(buildCommandDescriptorAtPath(commandPath([])))).toBe(true)
    expect(Option.isNone(buildCommandDescriptorAtPath(commandPath(["issues"])))).toBe(true)
    expect(Option.isNone(buildCommandDescriptorAtPath(commandPath(["unknown"])))).toBe(true)
  })

  it("accepts global options before generated subcommands", async () => {
    const error = await rejected(runCommand(["--json", "issues", "list", "--output", "out.json"]))

    expect(errorMessage(error)).toContain("issues list does not support --output")
  })

  it("accepts global options between generated command groups", async () => {
    const error = await rejected(runCommand(["issues", "--json", "labels", "add", "--output", "out.json"]))

    expect(errorMessage(error)).toContain("issues labels add does not support --output")
  })

  it("rejects --output for commands without file output behavior", async () => {
    const error = await rejected(runCommand(["issues", "list", "--output", "out.json"]))

    expect(errorMessage(error)).toContain("issues list does not support --output")
  })

  it.each([
    [["boards", "cards", "labels", "list", "board-1", "card-1", "--output", "out.json"], "boards cards labels list"],
    [["cards", "versions", "list", "Default", "card-1", "--output", "out.json"], "cards versions list"],
    [
      [
        "channels",
        "messages",
        "attachments",
        "get",
        '{"messageId":"message-1"}',
        "attachment-1",
        "--output",
        "out.json"
      ],
      "channels messages attachments get"
    ],
    [
      ["recruiting", "vacancy", "statuses", "list", "vacancy-1", "--output", "out.json"],
      "recruiting vacancy statuses list"
    ]
  ])("routes generated read-only command %s", async (argv, path) => {
    const error = await rejected(runCommand(argv))

    expect(errorMessage(error)).toContain(`${path} does not support --output`)
  })

  it.each([
    [["labels", "create", "triage", "--output", "out.json"], "labels create does not support --output"],
    [["boards", "cards", "delete", "board-1", "card-1"], "boards cards delete requires --yes."]
  ])("routes generated mutation command %s", async (argv, message) => {
    const error = await rejected(runCommand(argv))

    expect(errorMessage(error)).toContain(message)
  })

  it("maps root global option parse errors into CLI runtime errors", async () => {
    const error = await rejected(runCommand(["issues", "list", "--json=maybe"]))

    expect(errorMessage(error)).toContain("Received unknown argument")
  })

  it("maps an unknown command without JSON mode to an actionable input error", async () => {
    const error = await rejected(runCommand(["not-a-command"]))

    expect(errorMessage(error)).toContain("not-a-command")
  })

  it("accepts the root version request", async () => {
    await expect(runCommand(["--version"])).resolves.toBeUndefined()
  })

  it("renders nested command help without duplicate path segments", async () => {
    await expect(runCommand(["issues", "--help"])).resolves.toBeUndefined()
  })
})
