import * as fs from "node:fs/promises"

import { Schema } from "effect"

import { runCapturedProcess } from "./captured-process.js"
import type { CapturedProcessResult } from "./captured-process-schema.js"
import {
  decodeOracleStdioResponses,
  normalizeOracleCliVersion,
  oracleLegacyStdioInput,
  oracleStdioInput,
  requireSuccessfulOracleProcess
} from "./effect4-oracle-process.js"
import { type BundledProcesses, BundledProcessesSchema, type OracleJsonRpcResponse } from "./effect4-oracle-schema.js"

const PackageManifestSchema = Schema.Struct({ version: Schema.String })

const captureStdioMode = async (mode: "native" | "proxy") => {
  const result = await runCapturedProcess(
    process.execPath,
    ["dist/index.cjs"],
    { HULY_TOOL_MODE: mode, LAZY_ENVS: "true", MCP_AUTO_EXIT: "true" },
    oracleStdioInput()
  )
  return decodeOracleStdioResponses(requireSuccessfulOracleProcess(`Bundled ${mode} stdio oracle`, result).stdout)
}

const captureLegacyStdio = async (): Promise<ReadonlyArray<OracleJsonRpcResponse>> => {
  const result = await runCapturedProcess(
    process.execPath,
    ["dist/index.cjs"],
    { HULY_TOOL_MODE: "proxy", LAZY_ENVS: "true", MCP_AUTO_EXIT: "true" },
    oracleLegacyStdioInput()
  )
  return decodeOracleStdioResponses(requireSuccessfulOracleProcess("Bundled legacy stdio oracle", result).stdout)
}

const captureCli = async () => {
  const baseEnv = { NO_COLOR: "1" }
  const commands = {
    rootHelp: ["--help"],
    groupHelp: ["issues", "--help"],
    leafHelp: ["issues", "create", "--help"],
    humanError: ["issues", "create", "--input-json", "{bad"],
    jsonErrorAfterDeepCommand: ["issues", "labels", "add", "--input-json", "{bad", "--json"],
    jsonErrorBeforeDeepCommand: ["--json", "issues", "labels", "add", "--input-json", "{bad"]
  }
  const captureEntries = async (
    entries: ReadonlyArray<readonly [string, ReadonlyArray<string>]>
  ): Promise<ReadonlyArray<readonly [string, CapturedProcessResult]>> => {
    const [entry, ...remaining] = entries
    if (entry === undefined) return []
    const [name, args] = entry
    const result = normalizeOracleCliVersion(
      await runCapturedProcess(process.execPath, ["packages/huly-cli/dist/index.cjs", ...args], baseEnv)
    )
    return [[name, result], ...(await captureEntries(remaining))]
  }
  return Object.fromEntries(await captureEntries(Object.entries(commands)))
}

const manifestVersion = async (manifestPath: string): Promise<string> =>
  (
    await Schema.decodeUnknownPromise(Schema.fromJsonString(PackageManifestSchema))(
      await fs.readFile(manifestPath, "utf8")
    )
  ).version

const embeddedManifestVersion = async (manifestPath: string, bundlePath: string): Promise<boolean> => {
  const [version, bundle] = await Promise.all([manifestVersion(manifestPath), fs.readFile(bundlePath, "utf8")])
  return bundle.includes(JSON.stringify(version))
}

export const captureBundledProcessOracle = async (): Promise<BundledProcesses> =>
  Schema.decodeUnknownSync(BundledProcessesSchema)({
    artifacts: {
      cli: {
        embeddedManifestVersion: await embeddedManifestVersion(
          "packages/huly-cli/package.json",
          "packages/huly-cli/dist/index.cjs"
        )
      },
      mcp: { embeddedManifestVersion: await embeddedManifestVersion("package.json", "dist/index.cjs") }
    },
    cli: await captureCli(),
    stdio: {
      legacy: await captureLegacyStdio(),
      native: await captureStdioMode("native"),
      proxy: await captureStdioMode("proxy")
    }
  })
