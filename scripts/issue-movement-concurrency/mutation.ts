import { Schema } from "effect"
import { IssueSchema } from "../../src/domain/schemas/issues.js"
import { MutationResultSchema, type ScenarioArguments } from "./scenario-contract.js"
import { runPublic } from "./public-process.js"

export const readStableIssue = async (args: ScenarioArguments, signal: AbortSignal) => {
  const output = await runPublic(
    [
      "packages/huly-cli/dist/index.cjs",
      "issues",
      "get",
      args.mutationTarget.project,
      args.mutationTarget.issueId,
      "--json"
    ],
    args.upstream,
    signal
  )
  const parsed = Schema.decodeUnknownSync(Schema.fromJsonString(IssueSchema))(output)
  if (parsed.issueId !== args.mutationTarget.issueId) throw new Error("Stable-ID read returned a different issue")
  return parsed
}

export const runMutation = async (args: ScenarioArguments, signal: AbortSignal) => {
  const before = await readStableIssue(args, signal)
  const parent = args.mutationParents[before.project]
  const replacements = new Map<string, string>([
    ["@PROJECT", before.project],
    ["@IDENTIFIER", before.identifier],
    ["@ISSUE_ID", before.issueId]
  ])
  if (parent !== undefined) replacements.set("@PARENT_DESTINATION", JSON.stringify({ parent }))
  if (args.mutationKind === "ancestry" && parent === undefined)
    throw new Error("Current-project mutation parent unavailable")
  const argv = args.mutationArgs.map((argument) => replacements.get(argument) ?? argument)
  const result =
    args.mutationKind === "none"
      ? { kind: "none" }
      : {
          kind: args.mutationKind,
          result: Schema.decodeUnknownSync(Schema.fromJsonString(Schema.JsonObject))(
            await runPublic(["packages/huly-cli/dist/index.cjs", ...argv, "--json"], args.upstream, signal)
          )
        }
  return { before, action: Schema.decodeUnknownSync(MutationResultSchema)(result) }
}
