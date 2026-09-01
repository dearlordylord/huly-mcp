import type { UserProfile } from "@hcengineering/contact"
import type { Blob, Data, TxOperations } from "@hcengineering/core"
import { Schema, SchemaIssue } from "effect"
import { createRequire } from "node:module"
import { parseArgs } from "node:util"

import { NonEmptyString, PersonId } from "../src/domain/schemas/shared.js"
import { contact } from "../src/huly/huly-plugins.js"
import { hulyQuery } from "../src/huly/operations/query-helpers.js"
import { toClassRef, toRef } from "../src/huly/operations/sdk-boundary.js"
import { connectIntegrationHuly } from "./integration-huly-client.js"

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/consistent-type-imports, no-restricted-syntax -- CJS runtime boundary for SDK ID generation under the integration tsx runner.
const core = require("@hcengineering/core") as typeof import("@hcengineering/core")
// eslint-disable-next-line @typescript-eslint/consistent-type-imports, no-restricted-syntax -- CJS runtime boundary for rank generation under the integration tsx runner.
const rank = require("@hcengineering/rank") as typeof import("@hcengineering/rank")

const NODE_ARGUMENT_OFFSET = 2
const ProfileId = NonEmptyString.pipe(Schema.brand("IntegrationUserProfileId"))
const CliArgsSchema = Schema.Union([
  Schema.Struct({ mode: Schema.Literal("setup"), personId: PersonId, title: NonEmptyString }),
  Schema.Struct({ mode: Schema.Literal("cleanup"), profileId: ProfileId })
])
const SetupResultSchema = Schema.Struct({ profileId: ProfileId })
const CleanupResultSchema = Schema.Struct({ removed: Schema.Boolean })
type CliArgs = Schema.Schema.Type<typeof CliArgsSchema>

const parseCliArgs = (): CliArgs =>
  Schema.decodeUnknownSync(CliArgsSchema)(
    parseArgs({
      args: process.argv.slice(NODE_ARGUMENT_OFFSET),
      options: {
        mode: { type: "string" },
        personId: { type: "string" },
        title: { type: "string" },
        profileId: { type: "string" }
      }
    }).values
  )

const removeIfPresent = async (client: TxOperations, profileId: Schema.Schema.Type<typeof ProfileId>) => {
  const id = toRef<UserProfile>(profileId)
  const profile = await client.findOne<UserProfile>(
    toClassRef<UserProfile>(contact.class.UserProfile),
    hulyQuery<UserProfile>({ _id: id })
  )
  if (profile === undefined) return false
  await client.removeDoc(toClassRef<UserProfile>(contact.class.UserProfile), profile.space, id)
  return true
}

const setup = async (
  client: TxOperations,
  args: Extract<CliArgs, { readonly mode: "setup" }>
): Promise<Schema.Schema.Type<typeof SetupResultSchema>> => {
  const profileId = ProfileId.make(core.generateId<UserProfile>())
  const data: Data<UserProfile> = {
    title: args.title,
    content: core.generateId<Blob>(),
    blobs: {},
    parentInfo: [],
    parent: null,
    rank: rank.makeRank(undefined, undefined),
    person: toRef(args.personId)
  }
  try {
    await client.createDoc(
      toClassRef<UserProfile>(contact.class.UserProfile),
      contact.space.Contacts,
      data,
      toRef<UserProfile>(profileId)
    )
    return { profileId }
  } catch (cause) {
    await removeIfPresent(client, profileId).catch(() => undefined)
    throw cause
  }
}

const main = async (): Promise<string> => {
  const args = parseCliArgs()
  const { client } = await connectIntegrationHuly()
  try {
    const result =
      args.mode === "setup"
        ? Schema.encodeUnknownSync(SetupResultSchema)(await setup(client, args))
        : Schema.encodeUnknownSync(CleanupResultSchema)({ removed: await removeIfPresent(client, args.profileId) })
    return JSON.stringify(result)
  } finally {
    await client.close()
  }
}

void main().then(
  (output) => {
    // eslint-disable-next-line no-console -- stdout is this integration helper's JSON result boundary.
    console.log(output)
  },
  (error: unknown) => {
    // eslint-disable-next-line no-console -- stderr is this integration helper's failure boundary.
    console.error(Schema.isSchemaError(error) ? SchemaIssue.makeFormatterDefault()(error.issue) : error)
    process.exitCode = 1
  }
)
