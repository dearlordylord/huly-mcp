#!/usr/bin/env node

import { spawn } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"

import { build } from "esbuild"
import { Schema } from "effect"

const NODE_ARGUMENT_OFFSET = 2
const runnerArguments = Schema.decodeUnknownSync(Schema.Array(Schema.String))(process.argv.slice(NODE_ARGUMENT_OFFSET))
const [rawEntry, ...forwardedArguments] = runnerArguments
const entry = Schema.decodeUnknownSync(
  Schema.Trimmed.pipe(
    Schema.check(Schema.isNonEmpty()),
    Schema.annotate({ message: () => "Usage: run-bundled.mjs <entry.ts> [...args]" })
  )
)(rawEntry)

const entryPath = resolve(entry)
const directory = await mkdtemp(join(dirname(entryPath), ".huly-cli-script-"))
const output = join(directory, "script.cjs")

const runGeneratedBundle = (bundlePath, args) =>
  new Promise((resolveExit, rejectExit) => {
    const child = spawn(process.execPath, [bundlePath, ...args], { stdio: "inherit" })
    const forwardInterrupt = () => child.kill("SIGINT")
    const forwardTermination = () => child.kill("SIGTERM")
    const removeSignalHandlers = () => {
      process.off("SIGINT", forwardInterrupt)
      process.off("SIGTERM", forwardTermination)
    }
    process.on("SIGINT", forwardInterrupt)
    process.on("SIGTERM", forwardTermination)
    child.once("error", (error) => {
      removeSignalHandlers()
      rejectExit(error)
    })
    child.once("close", (code) => {
      removeSignalHandlers()
      resolveExit(code ?? 1)
    })
  })

try {
  const result = await build({
    bundle: true,
    entryPoints: [entryPath],
    external: ["ws"],
    format: "cjs",
    platform: "node",
    write: false
  })
  const bundled = result.outputFiles[0]
  if (bundled === undefined) throw new Error(`Bundling ${entry} produced no output.`)
  await writeFile(output, bundled.contents)
  process.exitCode = await runGeneratedBundle(output, forwardedArguments)
} finally {
  await rm(directory, { force: true, recursive: true })
}
