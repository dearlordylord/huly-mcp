import * as fs from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { Client } from "@modelcontextprotocol/client"
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio"
import { Deferred, Effect, Result, Schema } from "effect"
import { expect } from "vitest"

import { cliProfilePaths, makeCliProfileStore } from "../../src/profiles/file-store.js"
import { CliCredentialsFileSchema, CliProfilesFileSchema, type ProfileUrlSchema } from "../../src/profiles/model.js"
import { testStdioEnvironment } from "../helpers/stdio-environment.js"
import { residentSelectionEnvironment } from "../helpers/resident-selection-environment.js"
import { HostMessage } from "../../src/resident/request-headers.js"
import { GetProjectResultSchema } from "../../src/domain/schemas/projects.js"
import { DisposableRestProject } from "./disposable-rest-fixture.js"

export const ProfileLifecycleProject = Schema.decodeUnknownSync(DisposableRestProject)({
  _id: "profile-lifecycle-project",
  _class: "tracker:class:Project",
  space: "fixture-space",
  modifiedOn: 1,
  modifiedBy: "fixture-owner",
  identifier: "PROFILEFIXTURE",
  name: "Profile authority fixture",
  archived: false
})
const ProjectReply = Schema.Struct({
  isError: Schema.optionalKey(Schema.Literal(false)),
  structuredContent: Schema.Struct({ result: GetProjectResultSchema })
})

const RESPONSE_BOUND = 5_000
const runFile = promisify(execFile)
const RefusedProcess = Schema.Struct({
  code: Schema.Literal(1),
  killed: Schema.Literal(false),
  signal: Schema.Null,
  stdout: Schema.String,
  stderr: Schema.String
})
const ATTACHMENT_REFUSAL = "Resident configuration is incompatible; no Huly request was dispatched"
const PROFILE_MISSING = "Selected Huly profile does not exist."

export const exercisePackagedProfileLifecycle = async (
  bundle: string,
  attachment: string,
  endpoint: Schema.Schema.Type<typeof ProfileUrlSchema>
) => {
  const directory = await fs.mkdtemp(join(await fs.realpath(tmpdir()), "resident-profile-lifecycle-"))
  const environment = {
    ...testStdioEnvironment(),
    XDG_CONFIG_HOME: directory,
    HULY_PROFILE: "selected",
    HULY_TOOL_MODE: "auto",
    MCP_TRANSPORT: "stdio-http",
    MCP_RESIDENT_ATTACHMENT_FILE: attachment
  }
  const store = makeCliProfileStore(cliProfilePaths("linux", environment, directory))
  const base = residentSelectionEnvironment()
  const original = { url: endpoint, workspace: base.HULY_WORKSPACE }
  const save = async (destination: typeof original, token: string | undefined, deleted = false) => {
    await Effect.runPromise(
      store.writeProfiles(
        Schema.decodeUnknownSync(CliProfilesFileSchema)({
          version: 1,
          activeProfile: "unrelated",
          profiles: deleted ? {} : { selected: destination, other: { ...original, workspace: "other" } }
        })
      )
    )
    await Effect.runPromise(
      store.writeCredentials(
        Schema.decodeUnknownSync(CliCredentialsFileSchema)({
          version: 1,
          tokens: token === undefined ? {} : { selected: token, other: "other-private-fixture-token" },
          destinations: { selected: destination, other: { ...original, workspace: "other" } }
        })
      )
    )
  }
  const connect = (profile = "selected") => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [bundle],
      stderr: "pipe",
      env: { ...environment, HULY_PROFILE: profile }
    })
    const client = new Client(
      { name: "claude-code", version: "1.0" },
      { versionNegotiation: { mode: { pin: "2026-07-28" } } }
    )
    const closed = Effect.runSync(Deferred.make<void>())
    client.onclose = () => Effect.runSync(Deferred.succeed(closed, undefined))
    const close = async () => {
      const ownsAdapter = transport.pid !== null
      await transport.close()
      if (ownsAdapter) await Effect.runPromise(Deferred.await(closed).pipe(Effect.timeout(RESPONSE_BOUND)))
    }
    return { client, transport, close }
  }
  const existing = connect()
  try {
    await save(original, base.HULY_TOKEN)
    await existing.client.connect(existing.transport, { timeout: RESPONSE_BOUND })
    const catalog = await existing.client.listTools(undefined, { timeout: RESPONSE_BOUND })
    const read = async (client: Client, tools: typeof catalog) => {
      const request = { name: "get_huly_context", arguments: {} }
      const toolDefinition = tools.tools.find((tool) => tool.name === request.name)
      if (toolDefinition === undefined) throw new Error("Context tool is absent from the actual catalog")
      const context = await client.callTool(request, { timeout: RESPONSE_BOUND, toolDefinition })
      const projectTool = tools.tools.find((tool) => tool.name === "get_project")
      if (projectTool === undefined) throw new Error("Project tool is absent from the actual catalog")
      const project = Schema.decodeUnknownSync(ProjectReply)(
        await client.callTool(
          { name: projectTool.name, arguments: { project: ProfileLifecycleProject.identifier } },
          { timeout: RESPONSE_BOUND, toolDefinition: projectTool }
        )
      ).structuredContent.result
      expect(project.identifier).toBe(ProfileLifecycleProject.identifier)
      expect(project.name).toBe(ProfileLifecycleProject.name)
      return context
    }
    const context = await read(existing.client, catalog)
    expect(context.isError ?? false).toBe(false)
    const refused = async (diagnostic = ATTACHMENT_REFUSAL, profile = "selected") => {
      const pending = runFile(process.execPath, [bundle], {
        timeout: RESPONSE_BOUND,
        env: { ...environment, HULY_PROFILE: profile }
      })
      pending.child.stdin?.on("error", () => {})
      pending.child.stdin?.end(
        `${Schema.encodeSync(Schema.fromJsonString(HostMessage))(
          HostMessage.make({ jsonrpc: "2.0", id: 1, method: "ping" })
        )}\n`
      )
      const outcome = await pending.then(
        () => undefined,
        (error: unknown) => error
      )
      const parsed = Schema.decodeUnknownResult(RefusedProcess)(outcome)
      expect(Result.isSuccess(parsed)).toBe(true)
      if (Result.isFailure(parsed)) throw new Error("Expected an owned adapter failure exit")
      expect(parsed.success.stdout).toBe("")
      expect(parsed.success.stderr.includes(diagnostic)).toBe(true)
      expect(parsed.success.stderr.includes("rotated-private-fixture-token")).toBe(false)
      expect(parsed.success.stderr.includes("other-private-fixture-token")).toBe(false)
      expect(parsed.success.stderr.includes(base.HULY_TOKEN)).toBe(false)
      const currentCatalog = await existing.client.listTools(undefined, { timeout: RESPONSE_BOUND })
      expect(currentCatalog).toEqual(catalog)
      expect(await read(existing.client, currentCatalog)).toEqual(context)
    }
    await save(original, "rotated-private-fixture-token")
    await refused()
    await save(original, undefined)
    await refused("Selected Huly profile has no usable credentials.")
    await save({ ...original, url: "http://127.0.0.1:2" }, base.HULY_TOKEN)
    await refused()
    await save({ ...original, workspace: "replacement" }, base.HULY_TOKEN)
    await refused()
    await save(original, base.HULY_TOKEN, true)
    await refused(PROFILE_MISSING)
    await save(original, base.HULY_TOKEN)
    await refused(ATTACHMENT_REFUSAL, "other")
    await refused(PROFILE_MISSING, "missing")
    const restored = connect()
    try {
      await restored.client.connect(restored.transport, { timeout: RESPONSE_BOUND })
      const restoredCatalog = await restored.client.listTools(undefined, { timeout: RESPONSE_BOUND })
      expect(restoredCatalog).toEqual(catalog)
      expect((await read(restored.client, restoredCatalog)).isError ?? false).toBe(false)
    } finally {
      await restored.close()
    }
  } finally {
    await existing.close()
    await fs.rm(directory, { recursive: true, force: true })
  }
}
