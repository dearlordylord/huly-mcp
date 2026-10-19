import { Effect } from "effect"
import { HulyError } from "../huly/errors-base.js"
import { ToolProvisionFailure } from "./tools/operation-failure.js"
import {
  operationFailureToMcp,
  operationSuccessToMcp,
  type RegisteredTool,
  type ToolDefinition
} from "./tools/registry.js"

export type ToolGroupLoader = () => Promise<ReadonlyArray<RegisteredTool>>

export const makeToolGroupLoader = (load: ToolGroupLoader): ToolGroupLoader => {
  let pending: ReturnType<ToolGroupLoader> | undefined
  return () => (pending ??= load())
}

export const preloadToolGroups = (loaders: ReadonlyArray<ToolGroupLoader>) =>
  Effect.forEach(loaders, (load) =>
    Effect.tryPromise({
      try: load,
      catch: () => new HulyError({ message: "Tool preload failed. Restart the server or reinstall the package." })
    })
  ).pipe(Effect.asVoid)

export const makeLazyTool = <Name extends string>(
  definition: ToolDefinition<Name>,
  load: ToolGroupLoader
): RegisteredTool<Name> => {
  const loadGroup = makeToolGroupLoader(load)
  const unavailable = () =>
    new ToolProvisionFailure({
      error: new HulyError({
        message: `Unable to load tool ${definition.name}. Restart the MCP server; if this persists, reinstall the package.`
      })
    })
  const operation: RegisteredTool<Name>["operation"] = {
    ...definition,
    execute: (...args) =>
      Effect.tryPromise({ try: loadGroup, catch: unavailable }).pipe(
        Effect.flatMap((tools) => {
          const tool = tools.find((candidate) => candidate.name === definition.name)
          return tool === undefined ? Effect.fail(unavailable()) : tool.operation.execute(...args)
        })
      )
  }
  return {
    ...definition,
    operation,
    handler: (...args) =>
      Effect.runPromise(
        operation
          .execute(...args)
          .pipe(Effect.match({ onFailure: operationFailureToMcp, onSuccess: operationSuccessToMcp }))
      )
  }
}
