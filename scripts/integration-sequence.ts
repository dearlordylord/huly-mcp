import type { Sequence } from "@hcengineering/core"
import { Console, Effect, Schema } from "effect"
import { parseArgs } from "node:util"

import { HulySequenceId } from "../src/domain/schemas/sdk-discovery-configurations.js"
import { core } from "../src/huly/huly-plugins.js"
import { hulyQuery } from "../src/huly/operations/query-helpers.js"
import { toRef } from "../src/huly/operations/sdk-boundary.js"
import { connectIntegrationHuly } from "./integration-huly-client.js"

const NODE_ARGV_OFFSET = 2
const ArgsSchema = Schema.Struct({ action: Schema.Literals(["increment", "delete-owned"]), sequence: HulySequenceId })
const ResultSchema = Schema.Struct({ action: Schema.Literals(["increment", "delete-owned"]), sequence: HulySequenceId })
type Args = Schema.Schema.Type<typeof ArgsSchema>

const parseCliArgs = (): Args =>
  Schema.decodeUnknownSync(ArgsSchema)(
    parseArgs({
      args: process.argv.slice(NODE_ARGV_OFFSET),
      options: { action: { type: "string" }, sequence: { type: "string" } }
    }).values
  )

const main = async (): Promise<void> => {
  const args = parseCliArgs()
  const { client } = await connectIntegrationHuly()
  try {
    const sequence = await client.findOne<Sequence>(
      core.class.Sequence,
      hulyQuery<Sequence>({ _id: toRef<Sequence>(args.sequence) })
    )
    if (sequence === undefined) throw new Error(`Sequence '${args.sequence}' not found.`)
    if (args.action === "increment") {
      await client.updateDoc(sequence._class, sequence.space, sequence._id, { $inc: { sequence: 1 } })
    } else {
      await client.removeDoc(sequence._class, sequence.space, sequence._id)
    }
    await Effect.runPromise(Console.log(JSON.stringify(Schema.encodeSync(ResultSchema)(args))))
  } finally {
    await client.close()
  }
}

main().catch(async (error: unknown) => {
  await Effect.runPromise(Console.error(error))
  process.exitCode = 1
})
