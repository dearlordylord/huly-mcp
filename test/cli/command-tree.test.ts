import { Command } from "@effect/cli"
import { NodeContext } from "@effect/platform-node"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { buildRootCommand } from "../../packages/huly-cli/src/command-tree.js"
import { isRootHelpRequest, renderRootHelp } from "../../packages/huly-cli/src/help.js"

const runCommand = (argv: ReadonlyArray<string>): Promise<void> =>
  Effect.runPromise(
    Command.run(buildRootCommand(argv), {
      name: "Huly CLI",
      version: "test"
    })(["node", "huly", ...argv]).pipe(Effect.provide(NodeContext.layer))
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

describe("CLI command tree", () => {
  it("accepts global options before generated subcommands", async () => {
    const error = await rejected(runCommand(["--json", "issues", "list", "--output", "out.json"]))

    expect(errorMessage(error)).toContain("issues list does not support --output")
  })

  it("rejects --output for commands without file output behavior", async () => {
    const error = await rejected(runCommand(["issues", "list", "--output", "out.json"]))

    expect(errorMessage(error)).toContain("issues list does not support --output")
  })

  it.each([
    [["boards", "cards", "labels", "list", "board-1", "card-1", "--output", "out.json"], "boards cards labels list"],
    [
      ["channels", "messages", "attachments", "get", "message-1", "attachment-1", "--output", "out.json"],
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

    expect(errorMessage(error)).toContain("Too many positional arguments")
  })

  it("renders nested command help without duplicate path segments", async () => {
    await expect(runCommand(["issues", "--help"])).resolves.toBeUndefined()
  })

  it("renders catalog-derived root help without duplicate path segments", () => {
    const help = renderRootHelp("test")

    expect(help).toContain("issues labels add")
    expect(help).not.toContain("issues issues")
    expect(help).not.toContain("documents documents")
  })

  it("detects exact root help requests", () => {
    expect(isRootHelpRequest(["--help"])).toBe(true)
    expect(isRootHelpRequest(["-h"])).toBe(true)
    expect(isRootHelpRequest([])).toBe(false)
    expect(isRootHelpRequest(["issues", "--help"])).toBe(false)
    expect(isRootHelpRequest(Array.from({ length: 1 }))).toBe(false)
  })
})
