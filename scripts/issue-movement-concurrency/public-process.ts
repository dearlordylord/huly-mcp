import { spawn } from "node:child_process"
import { Schema } from "effect"
import type { UrlString } from "../../src/domain/schemas/shared.js"

// Process environment is framework-owned and remains in this adapter; credentials are never emitted.
export const runPublic = (argv: ReadonlyArray<string>, url: UrlString, signal: AbortSignal, input?: string) =>
  new Promise<string>((resolve, reject) => {
    const child = spawn(process.execPath, [...argv], {
      env: { ...process.env, HULY_URL: url, HULY_TOOL_MODE: "native", MCP_AUTO_EXIT: "true" },
      stdio: ["pipe", "pipe", "ignore"],
      signal
    })
    const chunks: Array<Buffer> = []
    child.stdout.on("data", (chunk: unknown) => {
      const parsed = Schema.decodeUnknownOption(Schema.Uint8Array)(chunk)
      if (parsed._tag === "None") { child.kill(); reject(new Error("Public fixture returned invalid output bytes")) }
      else chunks.push(Buffer.from(parsed.value))
    })
    child.on("error", () => reject(new Error("Public fixture process unavailable")))
    child.stdin.on("error", () => reject(new Error("Public fixture input unavailable")))
    child.on("exit", (code) => code === 0
      ? resolve(Buffer.concat(chunks).toString("utf8"))
      : reject(new Error("Public fixture process returned no successful response")))
    child.stdin.end(input)
  })
