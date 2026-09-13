import { execFileSync } from "node:child_process"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import {
  type FullIntegrationAdapterResponse,
  FullIntegrationAdapterResponseSchema
} from "../../scripts/full-integration-adapter-contract.js"

const runAdapter = (executable: string, payload: string, imagePath: string) => {
  const stdout = execFileSync(
    "node",
    ["scripts/run-bundled.mjs", "scripts/cli-full-integration-adapter.ts", executable, payload, imagePath],
    { encoding: "utf8" }
  )
  const parsed: unknown = JSON.parse(stdout)
  return Schema.decodeUnknownSync(FullIntegrationAdapterResponseSchema)(parsed)
}

const successResult = (response: FullIntegrationAdapterResponse) => {
  if ("isError" in response.result) throw new Error("Expected adapter success.")
  return response.result
}

const errorResult = (response: FullIntegrationAdapterResponse) => {
  if (!("isError" in response.result)) throw new Error("Expected adapter error.")
  return response.result
}

const withExecutableStub = async (
  source: string,
  use: (executable: string, imagePath: string) => Promise<void> | void
): Promise<void> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "huly-cli-full-adapter-"))
  const executable = path.join(dir, "huly")
  const imagePath = path.join(dir, "image.bin")
  await fs.writeFile(executable, source, { encoding: "utf8", mode: 0o755 })
  try {
    await use(executable, imagePath)
  } finally {
    await fs.rm(dir, { force: true, recursive: true })
  }
}

describe("full CLI integration adapter", () => {
  it("invokes the native route with positional input and returns an MCP-compatible success envelope", async () => {
    await withExecutableStub(
      '#!/usr/bin/env bash\nprintf \'{"id":"project-id","identifier":"HULY"}\\n\'\n',
      (executable, imagePath) => {
        const payload = JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: { name: "get_project", arguments: { project: "HULY" } },
          id: 2
        })
        const response = runAdapter(executable, payload, imagePath)
        const result = successResult(response)

        expect(JSON.parse(result.content[0]?.type === "text" ? result.content[0].text : "null")).toEqual({
          id: "project-id",
          identifier: "HULY"
        })
        expect(result.structuredContent).toEqual({ result: { id: "project-id", identifier: "HULY" } })
      }
    )
  })

  it("returns CLI failures as MCP tool errors", async () => {
    await withExecutableStub(
      '#!/usr/bin/env bash\nprintf "Space not found\\n" >&2\nexit 1\n',
      (executable, imagePath) => {
        const payload = JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: { name: "get_project", arguments: { project: "missing" } },
          id: 3
        })
        const response = runAdapter(executable, payload, imagePath)
        const result = errorResult(response)

        expect(result.isError).toBe(true)
        expect(result.content[0]?.text).toContain("Space not found")
        expect(result).not.toHaveProperty("structuredContent")
      }
    )
  })

  it.each(["", "launcher diagnostic\n"])(
    "unwraps CLI JSON failures after %j for exact invitation cleanup",
    async (prefix) => {
      const personId = "employee-fixture-id"
      const message = `Employee '${personId}' was prepared for 'fixture@example.test', but sendInvite failed after: employee activation.`
      const failure = { code: "INTEGRATION_FAILED", message, retryable: false }
      await withExecutableStub(
        `#!/usr/bin/env node\nprocess.stderr.write(${JSON.stringify(prefix + JSON.stringify(failure))});\nprocess.exitCode = 1;\n`,
        (executable, imagePath) => {
          const payload = JSON.stringify({
            jsonrpc: "2.0",
            method: "tools/call",
            params: {
              name: "invite_employee",
              arguments: { mode: "create-or-promote", name: "Fixture", email: "fixture@example.test" }
            },
            id: 3
          })
          const result = errorResult(runAdapter(executable, payload, imagePath))

          expect(result.isError).toBe(true)
          expect(result.content[0]?.text).toBe(message)
          expect(result.content[0]?.text.match(/^Employee '([^']+)' was prepared/)?.[1]).toBe(personId)
        }
      )
    }
  )

  it("preserves agent-visible warnings in structured content", async () => {
    const warning = { code: "status_metadata_unresolved", message: "One status label could not be resolved." }
    await withExecutableStub(
      `#!/usr/bin/env bash\nprintf '%s\\n' '${JSON.stringify({ result: { statuses: [] }, warnings: [warning] })}'\n`,
      (executable, imagePath) => {
        const payload = JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: { name: "list_statuses", arguments: {} },
          id: 4
        })
        const response = runAdapter(executable, payload, imagePath)
        const result = successResult(response)

        expect(JSON.parse(result.content[0]?.type === "text" ? result.content[0].text : "null")).toEqual({
          statuses: []
        })
        expect(JSON.parse(result.content[1]?.type === "text" ? result.content[1].text : "null")).toEqual({
          warnings: [warning]
        })
        expect(result.structuredContent).toEqual({ result: { statuses: [] }, warnings: [warning] })
      }
    )
  })

  it("reconstructs MCP image content from the CLI output file", async () => {
    const imageData = "iVBORw0KGgo="
    await withExecutableStub(
      `#!/usr/bin/env bash\nwhile [ "$#" -gt 0 ]; do\n  if [ "$1" = "--output" ]; then printf '${imageData}' | base64 -d > "$2"; fi\n  shift\ndone\nprintf '%s\\n' '${JSON.stringify({ result: { name: "pixel.png" }, image: { mimeType: "image/png", encoding: "base64", base64Length: imageData.length } })}'\n`,
      (executable, imagePath) => {
        const payload = JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: { name: "read_attachment_content", arguments: { attachmentId: "attachment-id" } },
          id: 5
        })
        const response = runAdapter(executable, payload, imagePath)
        const result = successResult(response)
        const image = result.content.find((entry) => entry.type === "image")

        expect(image).toMatchObject({ data: imageData, mimeType: "image/png" })
        expect(result.structuredContent).toEqual({ result: { name: "pixel.png" } })
      }
    )
  })
})
