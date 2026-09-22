import type { AnyAttribute, Role, SpaceType } from "@hcengineering/core"
import { Console, Effect, Schema } from "effect"
import { parseArgs } from "node:util"

import { Count, RoleId, SpaceTypeId } from "../src/domain/schemas/shared.js"
import { core } from "../src/huly/huly-plugins.js"
import { hulyQuery } from "../src/huly/operations/query-helpers.js"
import { toRef } from "../src/huly/operations/sdk-boundary.js"
import { connectIntegrationHuly } from "./integration-huly-client.js"

const NODE_ARGV_OFFSET = 2
const ArgsSchema = Schema.Struct({
  action: Schema.Literals(["verify", "verify-absent", "delete"]),
  spaceType: SpaceTypeId,
  role: RoleId
})
const ResultSchema = Schema.Struct({ roleFound: Schema.Boolean, assignmentAttributes: Count, deleted: Schema.Boolean })
type Args = Schema.Schema.Type<typeof ArgsSchema>

const parseCliArgs = (): Args =>
  Schema.decodeUnknownSync(ArgsSchema)(
    parseArgs({
      args: process.argv.slice(NODE_ARGV_OFFSET),
      options: { action: { type: "string" }, spaceType: { type: "string" }, role: { type: "string" } }
    }).values
  )

const main = async (): Promise<void> => {
  const args = parseCliArgs()
  const { client } = await connectIntegrationHuly()
  try {
    const spaceType = await client.findOne<SpaceType>(
      core.class.SpaceType,
      hulyQuery<SpaceType>({ _id: toRef<SpaceType>(args.spaceType) })
    )
    if (spaceType === undefined) throw new Error(`SpaceType '${args.spaceType}' not found.`)
    const role = await client.findOne<Role>(
      core.class.Role,
      hulyQuery<Role>({ _id: toRef<Role>(args.role), attachedTo: spaceType._id })
    )
    const attributes = await client.findAll<AnyAttribute>(
      core.class.Attribute,
      hulyQuery<AnyAttribute>({ name: args.role, attributeOf: spaceType.targetClass })
    )
    if (args.action === "verify") {
      if (role === undefined || attributes.length !== 1) {
        throw new Error(
          `Role persistence mismatch: role=${String(role !== undefined)}, attributes=${attributes.length}.`
        )
      }
    } else if (args.action === "verify-absent") {
      if (role !== undefined || attributes.length !== 0) {
        throw new Error(`Role cleanup mismatch: role=${String(role !== undefined)}, attributes=${attributes.length}.`)
      }
    } else {
      for (const attribute of attributes) {
        await client.removeDoc(attribute._class, attribute.space, attribute._id)
      }
      if (role !== undefined) {
        await client.removeCollection(
          role._class,
          role.space,
          role._id,
          role.attachedTo,
          role.attachedToClass,
          role.collection
        )
      }
    }
    const result = Schema.encodeSync(ResultSchema)({
      roleFound: role !== undefined,
      assignmentAttributes: Count.make(attributes.length),
      deleted: args.action === "delete"
    })
    await Effect.runPromise(Console.log(JSON.stringify(result)))
  } finally {
    await client.close()
  }
}

main().catch(async (error: unknown) => {
  await Effect.runPromise(Console.error(error))
  process.exitCode = 1
})
