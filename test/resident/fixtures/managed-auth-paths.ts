import { strict as assert } from "node:assert"
import { execFile } from "node:child_process"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { promisify } from "node:util"
import { Client } from "@modelcontextprotocol/client"
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio"
import { Deferred, Effect, Schema } from "effect"

import { GetHulyContextResultSchema } from "../../../src/domain/schemas/huly-context.js"
import { cliProfilePaths, makeCliProfileStore } from "../../../src/profiles/file-store.js"
import { CliCredentialsFileSchema, CliProfilesFileSchema } from "../../../src/profiles/model.js"
import { ResidentPackagePath, ResidentRegistryEnvelope } from "../../../src/resident/managed-contract.js"
import { ResidentDirectory } from "../../../src/resident/protected-path.js"
import { openKernelReapedEvents, ReapedEventsFd } from "../../helpers/kernel-reaped-events.js"
import { residentSelectionEnvironment } from "../../helpers/resident-selection-environment.js"
import { testStdioEnvironment } from "../../helpers/stdio-environment.js"
import { ManagedAuthObservation } from "../managed-auth-observation.js"

const RESPONSE_BOUND = 5_000
const INITIAL_AUTHORITIES = 2
const ROTATED_AUTHORITIES = 3
const Input = Schema.Struct({ bundle: ResidentPackagePath, directory: ResidentDirectory, reapedFd: ReapedEventsFd })
const ContextReply = Schema.Struct({ result: GetHulyContextResultSchema })
const runFile = promisify(execFile)
const RefusedProcess = Schema.Struct({
  code: Schema.Literal(1),
  killed: Schema.Literal(false),
  signal: Schema.Null,
  stdout: Schema.String,
  stderr: Schema.String
})
type RefusalDiagnostic = "Selected Huly profile has no usable credentials." | "Selected Huly profile does not exist."

const main = async () => {
  const input = Schema.decodeUnknownSync(Input)({
    bundle: process.argv[2],
    directory: process.argv[3],
    reapedFd: process.env.HULY_TEST_REAPED_FD
  })
  const state = join(input.directory, "state")
  const config = join(input.directory, "config")
  const base = residentSelectionEnvironment()
  const store = makeCliProfileStore(cliProfilePaths("linux", { XDG_CONFIG_HOME: config }, input.directory))
  const destination = { url: base.HULY_URL, workspace: base.HULY_WORKSPACE }
  await Effect.runPromise(
    store.writeProfiles(
      Schema.decodeUnknownSync(CliProfilesFileSchema)({
        version: 1,
        activeProfile: "unrelated",
        profiles: { selected: destination, unrelated: { ...destination, workspace: "other" } }
      })
    )
  )
  await Effect.runPromise(
    store.writeCredentials(
      Schema.decodeUnknownSync(CliCredentialsFileSchema)({
        version: 1,
        tokens: { selected: base.HULY_TOKEN },
        destinations: { selected: destination }
      })
    )
  )
  const common = { MCP_TRANSPORT: "stdio-resident", MCP_RESIDENT_STATE_DIRECTORY: state, HULY_TOOL_MODE: "auto" }
  const profileEnvironment = { ...testStdioEnvironment(), ...common, XDG_CONFIG_HOME: config, HULY_PROFILE: "selected" }
  const environments = [
    profileEnvironment,
    { ...base, ...common },
    {
      ...testStdioEnvironment(),
      ...common,
      HULY_URL: base.HULY_URL,
      HULY_WORKSPACE: base.HULY_WORKSPACE,
      HULY_EMAIL: "fixture@example.invalid",
      HULY_PASSWORD: "fixture-private-password"
    }
  ]
  const makeSession = (env: (typeof environments)[number]) => {
    const transport = new StdioClientTransport({ command: process.execPath, args: [input.bundle], stderr: "pipe", env })
    const client = new Client(
      { name: "codex-mcp-client", version: "1" },
      { versionNegotiation: { mode: { pin: "2026-07-28" } } }
    )
    const closed = Effect.runSync(Deferred.make<void>())
    client.onclose = () => Effect.runSync(Deferred.succeed(closed, undefined))
    transport.stderr?.on("data", (chunk: Buffer) => process.stderr.write(chunk))
    return { client, closed, transport }
  }
  const sessions = environments.map(makeSession)
  const kernel = openKernelReapedEvents(input.reapedFd)
  const contexts: Array<Schema.Schema.Type<typeof GetHulyContextResultSchema>> = []
  try {
    try {
      for (const session of sessions) {
        await session.client.connect(session.transport, { timeout: RESPONSE_BOUND })
        const reply = await session.client.callTool(
          { name: "get_huly_context", arguments: {} },
          { timeout: RESPONSE_BOUND }
        )
        assert.notEqual(reply.isError, true)
        contexts.push(Schema.decodeUnknownSync(ContextReply)(reply.structuredContent).result)
      }
      const [profile, token, password] = contexts
      if (profile === undefined || token === undefined || password === undefined)
        throw new Error("Missing auth context")
      assert.equal(profile.huly.workspace.value, base.HULY_WORKSPACE)
      assert.equal(token.huly.workspace.value, base.HULY_WORKSPACE)
      assert.equal(password.huly.workspace.value, base.HULY_WORKSPACE)
      assert.equal(profile.auth.method, "token")
      assert.equal(token.auth.method, "token")
      assert.equal(password.auth.method, "password")
      assert.equal(profile.transport.http?.port, token.transport.http?.port)
      assert.notEqual(profile.transport.http?.port, password.transport.http?.port)
      const original = sessions[0]
      if (original === undefined) throw new Error("Missing original profile caller")
      const continued = await original.client.callTool(
        { name: "get_huly_context", arguments: {} },
        { timeout: RESPONSE_BOUND }
      )
      assert.notEqual(continued.isError, true)
      const retained = Schema.decodeUnknownSync(ContextReply)(continued.structuredContent).result
      assert.equal(retained.auth.method, "token")
      assert.equal(retained.huly.workspace.value, base.HULY_WORKSPACE)
      assert.equal(retained.transport.http?.port, profile.transport.http?.port)
      assert.equal((await fs.readdir(join(state, "generations"))).length, INITIAL_AUTHORITIES)
      await Effect.runPromise(
        store.writeCredentials(
          Schema.decodeUnknownSync(CliCredentialsFileSchema)({
            version: 1,
            tokens: { selected: "fixture-rotated-profile-token" },
            destinations: { selected: destination }
          })
        )
      )
      const rotated = makeSession(profileEnvironment)
      sessions.push(rotated)
      await rotated.client.connect(rotated.transport, { timeout: RESPONSE_BOUND })
      const rotatedReply = await rotated.client.callTool(
        { name: "get_huly_context", arguments: {} },
        { timeout: RESPONSE_BOUND }
      )
      assert.notEqual(rotatedReply.isError, true)
      const rotatedContext = Schema.decodeUnknownSync(ContextReply)(rotatedReply.structuredContent).result
      assert.equal(rotatedContext.auth.method, "token")
      assert.equal(rotatedContext.huly.workspace.value, base.HULY_WORKSPACE)
      assert.notEqual(rotatedContext.transport.http?.port, profile.transport.http?.port)
      assert.notEqual(rotatedContext.transport.http?.port, password.transport.http?.port)
      const oldReply = await original.client.callTool(
        { name: "get_huly_context", arguments: {} },
        { timeout: RESPONSE_BOUND }
      )
      assert.notEqual(oldReply.isError, true)
      const oldContext = Schema.decodeUnknownSync(ContextReply)(oldReply.structuredContent).result
      assert.equal(oldContext.transport.http?.port, profile.transport.http?.port)
      assert.equal(oldContext.auth.method, "token")
      const refusedProfile = async (diagnostic: RefusalDiagnostic) => {
        const pending = runFile(process.execPath, [input.bundle], { timeout: RESPONSE_BOUND, env: profileEnvironment })
        pending.child.stdin?.on("error", () => {})
        pending.child.stdin?.end()
        const failure = await pending.then(
          () => undefined,
          (error: unknown) => error
        )
        const refused = Schema.decodeUnknownSync(RefusedProcess)(failure)
        assert.equal(refused.stdout.length === 0, true)
        assert.equal(refused.stderr.includes(diagnostic), true)
        for (const secret of [base.HULY_TOKEN, "fixture-private-password", "fixture-rotated-profile-token"])
          assert.equal(refused.stderr.includes(secret), false)
        assert.equal((await fs.readdir(join(state, "generations"))).length, ROTATED_AUTHORITIES)
      }
      await Effect.runPromise(
        store.writeCredentials(
          Schema.decodeUnknownSync(CliCredentialsFileSchema)({
            version: 1,
            tokens: {},
            destinations: { selected: destination }
          })
        )
      )
      await refusedProfile("Selected Huly profile has no usable credentials.")
      await Effect.runPromise(
        store.writeProfiles(Schema.decodeUnknownSync(CliProfilesFileSchema)({ version: 1, profiles: {} }))
      )
      await refusedProfile("Selected Huly profile does not exist.")
      const afterDeletion = await original.client.callTool(
        { name: "get_huly_context", arguments: {} },
        { timeout: RESPONSE_BOUND }
      )
      assert.notEqual(afterDeletion.isError, true)
      assert.equal(
        Schema.decodeUnknownSync(ContextReply)(afterDeletion.structuredContent).result.transport.http?.port,
        profile.transport.http?.port
      )
      const records = await fs.readdir(join(state, "generations"))
      assert.equal(records.length, ROTATED_AUTHORITIES)
      const owners = await Promise.all(
        records.map(async (name) =>
          Schema.decodeUnknownSync(Schema.fromJsonString(ResidentRegistryEnvelope))(
            await fs.readFile(join(state, "generations", name), "utf8")
          )
        )
      )
      await Promise.all(
        sessions.map(async ({ closed, transport }) => {
          const ownsAdapter = transport.pid !== null
          await transport.close()
          if (ownsAdapter) await Effect.runPromise(Deferred.await(closed).pipe(Effect.timeout(RESPONSE_BOUND)))
        })
      )
      const backendExits = []
      for (const owner of owners) {
        const exit = await kernel.wait(owner.diagnostics.processId)
        assert.equal(exit.exitCode, 0)
        backendExits.push(exit)
      }
      assert.deepEqual(await fs.readdir(state), [])
      process.stdout.write(
        Schema.encodeSync(Schema.fromJsonString(ManagedAuthObservation))(
          Schema.decodeUnknownSync(ManagedAuthObservation)({
            profilePort: profile.transport.http?.port,
            environmentTokenPort: token.transport.http?.port,
            passwordPort: password.transport.http?.port,
            rotatedProfilePort: rotatedContext.transport.http?.port,
            logoutRefused: true,
            deletedProfileRefused: true,
            backendExits,
            privateStateRemoved: true
          })
        )
      )
    } finally {
      await Promise.all(sessions.map(({ transport }) => transport.close()))
    }
  } finally {
    kernel.close()
  }
}

void main().catch(() => {
  process.stderr.write("Managed auth-path fixture failed\n")
  process.exitCode = 1
})
