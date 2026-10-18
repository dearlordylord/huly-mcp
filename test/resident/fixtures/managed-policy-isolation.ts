import { strict as assert } from "node:assert"
import * as fs from "node:fs/promises"
import { join } from "node:path"
import { Client } from "@modelcontextprotocol/client"
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio"
import { Deferred, Effect, Schema } from "effect"

import { LiveReadProtocol } from "../../../scripts/resident-live-read-contract.js"

import { GetProjectResultSchema } from "../../../src/domain/schemas/projects.js"
import { DisposableRestProject, startDisposableRestFixture } from "../disposable-rest-fixture.js"

import { GetHulyContextResultSchema } from "../../../src/domain/schemas/huly-context.js"
import { McpErrorCode } from "../../../src/mcp/tool-responses.js"
import { ResidentPackagePath, ResidentRegistryEnvelope } from "../../../src/resident/managed-contract.js"
import { ResidentDirectory } from "../../../src/resident/protected-path.js"
import { openKernelReapedEvents, ReapedEventsFd } from "../../helpers/kernel-reaped-events.js"
import { residentSelectionEnvironment } from "../../helpers/resident-selection-environment.js"
import { ManagedPolicyObservation, ManagedPolicyScenario } from "../managed-policy-observation.js"

const RESPONSE_BOUND = 5_000
const POLICY_COUNT = 2
const Input = Schema.Struct({
  bundle: ResidentPackagePath,
  directory: ResidentDirectory,
  reapedFd: ReapedEventsFd,
  scenario: ManagedPolicyScenario,
  protocol: LiveReadProtocol
})
const ContextReply = Schema.Struct({ result: GetHulyContextResultSchema })
const ToolRefusal = Schema.Struct({
  isError: Schema.Literal(true),
  content: Schema.Array(Schema.Struct({ type: Schema.Literal("text"), text: Schema.String }))
})
const ProtocolRefusal = Schema.Struct({ code: Schema.Literal(McpErrorCode.InvalidParams), message: Schema.String })

const main = async () => {
  const input = Schema.decodeUnknownSync(Input)({
    bundle: process.argv[2],
    directory: process.argv[3],
    reapedFd: process.env.HULY_TEST_REAPED_FD,
    scenario: process.argv[4],
    protocol: process.argv[5]
  })
  const project = Schema.decodeUnknownSync(DisposableRestProject)({
    _id: "fixture-PROXY",
    _class: "tracker:class:Project",
    space: "fixture-space",
    modifiedOn: 1,
    modifiedBy: "fixture-owner",
    identifier: "PROXY",
    name: "Proxy 日本語",
    archived: false
  })
  const rest = await startDisposableRestFixture({ projects: [project] })
  const sessions = [
    { allowed: "list_projects", forbidden: "list_issues", toolset: "projects" },
    { allowed: "list_issues", forbidden: "list_projects", toolset: "issues" }
  ].map((policy) => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [input.bundle],
      stderr: "pipe",
      env: {
        ...residentSelectionEnvironment(),
        HULY_URL: rest.endpoint,
        MCP_TRANSPORT: "stdio-resident",
        MCP_RESIDENT_STATE_DIRECTORY: input.directory,
        ...(input.scenario === "native"
          ? { HULY_TOOL_MODE: "native", TOOLS: policy.allowed }
          : {
              HULY_TOOL_MODE: "proxy",
              TOOLSETS: policy.toolset,
              PROXY_OUTPUT_STRICT: String(input.scenario === "proxy-strict")
            })
      }
    })
    const client = new Client(
      { name: "claude-code", version: "1" },
      {
        supportedProtocolVersions: [input.protocol],
        versionNegotiation: { mode: input.protocol === "2025-06-18" ? "legacy" : { pin: input.protocol } }
      }
    )
    const closed = Effect.runSync(Deferred.make<void>())
    client.onclose = () => Effect.runSync(Deferred.succeed(closed, undefined))
    transport.stderr?.on("data", (chunk: Buffer) => process.stderr.write(chunk))
    return { ...policy, client, closed, transport }
  })
  const kernel = openKernelReapedEvents(input.reapedFd)
  const ports = []
  let cleanupFailed = false
  try {
    try {
      for (const session of sessions) {
        process.stderr.write(`Managed policy: connecting ${session.allowed}\n`)
        await session.client.connect(session.transport, { timeout: RESPONSE_BOUND })
        assert.equal(session.client.getNegotiatedProtocolVersion(), input.protocol)
        process.stderr.write("Managed policy: reading catalog\n")
        const catalog = await session.client.listTools(undefined, { timeout: RESPONSE_BOUND })
        const names = catalog.tools.map((tool) => tool.name)
        assert.equal(names.includes(session.allowed), input.scenario !== "proxy-strict")
        assert.equal(names.includes(session.forbidden), false)
        if (input.scenario !== "native") {
          assert.equal(names.includes("invoke_tool"), true)
          const definition = await session.client.callTool(
            { name: "get_tool_schema", arguments: { toolName: session.allowed } },
            { timeout: RESPONSE_BOUND }
          )
          assert.notEqual(definition.isError, true)
          assert.equal(
            Schema.decodeUnknownSync(Schema.Struct({ result: Schema.Struct({ name: Schema.String }) }))(
              definition.structuredContent
            ).result.name,
            session.allowed
          )
        }
        if (input.scenario !== "native" && session.toolset === "projects") {
          process.stderr.write("Managed policy: invoking project read\n")
          const invoked = await session.client.callTool(
            { name: "invoke_tool", arguments: { toolName: "get_project", arguments: { project: project.identifier } } },
            { timeout: RESPONSE_BOUND }
          )
          assert.notEqual(invoked.isError, true)
          const actual = Schema.decodeUnknownSync(
            Schema.Struct({
              result: Schema.Struct({ toolName: Schema.Literal("get_project"), result: GetProjectResultSchema })
            })
          )(invoked.structuredContent).result.result
          assert.equal(actual.identifier, project.identifier)
          assert.equal(actual.name, project.name)
          assert.equal(actual.archived, false)
          process.stderr.write("Managed policy: reading project resource\n")
          const resource = await session.client.readResource(
            { uri: `huly://projects/${project.identifier}` },
            { timeout: RESPONSE_BOUND }
          )
          const parsed = Schema.decodeUnknownSync(
            Schema.Struct({ contents: Schema.Array(Schema.Struct({ uri: Schema.String, text: Schema.String })) })
          )(resource)
          assert.equal(parsed.contents.length, 1)
          const content = parsed.contents[0]
          assert.ok(content !== undefined)
          assert.equal(content.uri, `huly://projects/${project.identifier}`)
          assert.deepEqual(
            Schema.decodeUnknownSync(
              Schema.fromJsonString(
                Schema.Struct({
                  type: Schema.Literal("huly.project"),
                  uri: Schema.Literal("huly://projects/PROXY"),
                  project: GetProjectResultSchema
                })
              )
            )(content.text).project,
            actual
          )
        }
        process.stderr.write("Managed policy: reading context\n")
        const context = await session.client.callTool(
          { name: "get_huly_context", arguments: {} },
          { timeout: RESPONSE_BOUND }
        )
        assert.notEqual(context.isError, true)
        ports.push(Schema.decodeUnknownSync(ContextReply)(context.structuredContent).result.transport.http?.port)
        if (input.scenario === "proxy-non-strict") {
          const crossSchema = await session.client.callTool(
            { name: "get_tool_schema", arguments: { toolName: session.forbidden } },
            { timeout: RESPONSE_BOUND }
          )
          assert.notEqual(crossSchema.isError, true)
          assert.equal(
            Schema.decodeUnknownSync(Schema.Struct({ result: Schema.Struct({ name: Schema.String }) }))(
              crossSchema.structuredContent
            ).result.name,
            session.forbidden
          )
          continue
        }
        process.stderr.write("Managed policy: attempting cross-policy call\n")
        await session.client
          .callTool(
            input.scenario === "native"
              ? { name: session.forbidden, arguments: {} }
              : { name: "invoke_tool", arguments: { toolName: session.forbidden, arguments: {} } },
            { timeout: RESPONSE_BOUND }
          )
          .then(
            (reply) => {
              process.stderr.write(`Managed policy: returned tool error ${reply.isError === true}\n`)
              const refusal = Schema.decodeUnknownSync(ToolRefusal)(reply)
              assert.equal(
                refusal.content.some((item) => item.text.includes(`Unknown tool: ${session.forbidden}`)),
                true
              )
            },
            (error: unknown) => {
              const refusal = Schema.decodeUnknownSync(ProtocolRefusal)(error)
              process.stderr.write(`Managed policy: returned protocol code ${refusal.code}\n`)
              assert.equal(refusal.message.includes(`Tool '${session.forbidden}' not found`), true)
            }
          )
      }
      const [projectPort, issuePort] = ports
      assert.notEqual(projectPort, issuePort)
      const records = await fs.readdir(join(input.directory, "generations"))
      assert.equal(records.length, POLICY_COUNT)
      const owners = await Promise.all(
        records.map(async (name) =>
          Schema.decodeUnknownSync(Schema.fromJsonString(ResidentRegistryEnvelope))(
            await fs.readFile(join(input.directory, "generations", name), "utf8")
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
      assert.deepEqual(await fs.readdir(input.directory), [])
      assert.equal(rest.observed.modelRequests, input.scenario === "native" ? 0 : 1)
      assert.deepEqual(
        rest.observed.projectQueries,
        input.scenario === "native" ? [] : [project.identifier, project.identifier]
      )
      assert.equal(rest.observed.projectReads, input.scenario === "native" ? 0 : POLICY_COUNT)
      assert.equal(rest.observed.projectWrites, 0)
      assert.equal(rest.observed.invalidRequests, 0)
      process.stdout.write(
        Schema.encodeSync(Schema.fromJsonString(ManagedPolicyObservation))(
          Schema.decodeUnknownSync(ManagedPolicyObservation)({
            projectPort,
            issuePort,
            scenario: input.scenario,
            protocol: input.protocol,
            crossPolicyEvidence: input.scenario === "proxy-non-strict" ? "schema-visible" : "call-refused",
            backendExits,
            privateStateRemoved: true
          })
        )
      )
    } finally {
      await Promise.all(sessions.map(({ transport }) => transport.close()))
    }
  } finally {
    const cleanup = await Promise.allSettled([Promise.resolve().then(() => kernel.close()), rest.close()])
    cleanupFailed = cleanup.some((result) => result.status === "rejected")
    if (cleanupFailed) process.stderr.write("Managed policy resource cleanup failed\n")
  }
  if (cleanupFailed) throw new Error("Managed policy resource cleanup failed")
}

void main().catch(() => {
  process.stderr.write("Managed policy isolation fixture failed\n")
  process.exitCode = 1
})
