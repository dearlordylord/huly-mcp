import * as fs from "node:fs/promises"
import { join } from "node:path"
import { NodeServices } from "@effect/platform-node"
import { ConfigProvider, Effect, Redacted, Schema } from "effect"
import { TestConsole } from "effect/testing"
import { Command } from "effect/cli"
import { expect, it } from "vitest"

import { residentCommand } from "../../packages/huly-cli/src/resident-commands.js"
import { withSelectionClaim } from "../../src/resident/selection-claim.js"
import { ResidentStateStatus } from "../../src/resident/state-status.js"
import { withRegistryDirectory } from "../helpers/resident-registry-fixture.js"
import { withPublishedResidentState } from "../helpers/resident-status-fixture.js"

const runCommand = (argv: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    yield* Command.runWith(residentCommand, { version: "test", renderErrors: false })(argv).pipe(
      Effect.provide(NodeServices.layer)
    )
    return yield* TestConsole.logLines
  }).pipe(Effect.provide(TestConsole.layer))

it("prints schema-encoded redacted status from actual protected files", async () =>
  withPublishedResidentState(async (directory, record, attachment) => {
    const original = await fs.readFile(record, "utf8")
    const lines = await Effect.runPromise(runCommand(["status", "--state-directory", directory, "--json"]))
    const result = Schema.decodeUnknownSync(Schema.fromJsonString(ResidentStateStatus))(lines.join("\n"))
    expect(result).toMatchObject({
      state: "observed",
      generations: [{ generation: attachment.identity.generation, liveness: "unverified" }]
    })
    expect(await fs.readFile(record, "utf8")).toBe(original)
    expect(lines.join("\n").includes(Redacted.value(attachment.identity.key))).toBe(false)
    const text = (await Effect.runPromise(runCommand(["status", "--state-directory", directory]))).join("\n")
    expect(text).toContain(`generation=${attachment.identity.generation}`)
    expect(text).toContain("liveness=unverified")
    expect(text.includes(Redacted.value(attachment.identity.key))).toBe(false)
  }))

it("selects the configured namespace without requiring Huly credentials or creating absent state", async () =>
  withRegistryDirectory(async (directory) => {
    const missing = join(directory, "absent")
    const lines = await Effect.runPromise(
      runCommand(["status", "--json"]).pipe(
        Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ MCP_RESIDENT_STATE_DIRECTORY: missing })))
      )
    )
    expect(Schema.decodeUnknownSync(Schema.fromJsonString(ResidentStateStatus))(lines.join("\n"))).toMatchObject({
      state: "absent"
    })
    expect(await fs.readdir(directory)).toEqual([])
    const text = await Effect.runPromise(runCommand(["status", "--state-directory", missing]))
    expect(text.join("\n")).toContain("Resident state: absent")
  }))

it("keeps a present claim explicitly unverified in text output", async () =>
  withRegistryDirectory(async (directory) => {
    const lines = await Effect.runPromise(
      withSelectionClaim(directory, runCommand(["status", "--state-directory", directory]))
    )
    expect(lines.join("\n")).toContain("Selection claim: present-unverified")
    expect(lines.join("\n")).toContain("neither readiness nor retirement")
    expect(await fs.readdir(directory)).toEqual([])
  }))

it("returns a useful typed failure for unsafe state and invalid directory input", async () =>
  withRegistryDirectory(async (directory) => {
    const file = join(directory, "unexpected")
    await fs.writeFile(file, "preserve-this-private-data")
    await expect(Effect.runPromise(runCommand(["status", "--state-directory", directory]))).rejects.toThrow(
      "Resident registry is unresolved"
    )
    expect(await fs.readFile(file, "utf8")).toBe("preserve-this-private-data")
    await fs.unlink(file)
    await fs.chmod(directory, 0o755)
    await expect(Effect.runPromise(runCommand(["status", "--state-directory", directory]))).rejects.toThrow(
      "owned by this OS user"
    )
    await expect(Effect.runPromise(runCommand(["status", "--state-directory", ""]))).rejects.toThrow(
      "could not select a protected state directory"
    )
  }))
