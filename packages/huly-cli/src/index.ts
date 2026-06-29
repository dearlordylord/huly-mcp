#!/usr/bin/env node
import { Command } from "@effect/cli"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Console, Effect, Logger, LogLevel } from "effect"

import { TelemetryService } from "../../../src/telemetry/telemetry.js"
import { buildRootCommand } from "./command-tree.js"
import { isRootHelpRequest, renderRootHelp } from "./help.js"
import { CliInputError } from "./input.js"
import { CliRuntimeError } from "./render.js"

declare const PKG_VERSION: string

const cliVersion = typeof PKG_VERSION === "string" ? PKG_VERSION : "0.43.0"

const makeCli = (argv: ReadonlyArray<string>) =>
  Command.run(buildRootCommand(argv), {
    name: "Huly CLI",
    version: cliVersion
  })

const isKnownCliError = (error: unknown): error is CliInputError | CliRuntimeError =>
  error instanceof CliInputError || error instanceof CliRuntimeError

const main = Effect.suspend(() => {
  const argv = process.argv.slice(2)
  return isRootHelpRequest(argv) ? Console.log(renderRootHelp(cliVersion)) : makeCli(argv)(process.argv)
}).pipe(
  Effect.provide(NodeContext.layer),
  Effect.provide(TelemetryService.cliLayer),
  Effect.provide(Logger.minimumLogLevel(LogLevel.Warning)),
  Effect.catchAll((error) =>
    isKnownCliError(error)
      ? Console.error(error.message).pipe(
        Effect.zipRight(Effect.sync(() => {
          process.exitCode = 1
        }))
      )
      : Effect.fail(error)
  )
)

const isMainModule = (() => {
  if (typeof require !== "undefined" && require.main === module) return true
  return false
})()

if (isMainModule) {
  NodeRuntime.runMain(main)
}
