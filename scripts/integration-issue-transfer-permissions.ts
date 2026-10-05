// Disposable fixture setup; movement itself must never change these permissions.
import type { Project } from "@hcengineering/tracker"
import { Schema } from "effect"
import { DocId, AccountUuid, ProjectIdentifier } from "../src/domain/schemas/shared.js"
import { TransferProjectSchema } from "../src/domain/schemas/issue-transfer.js"
import { core, tracker } from "../src/huly/huly-plugins.js"
import { hulyQuery } from "../src/huly/operations/query-helpers.js"
import { toAccountUuid, toRef } from "../src/huly/operations/sdk-boundary.js"
import { connectIntegrationHuly } from "./integration-huly-client.js"

const Arguments = Schema.fromJsonString(Schema.Struct({ project: ProjectIdentifier, restricted: Schema.Boolean }))
const Result = Schema.Struct({ projectId: DocId })
const ProjectState = Schema.Struct({ ...TransferProjectSchema.fields, _id: DocId })
const parseResult = (input: unknown) => Schema.decodeUnknownSync(Result)(input)
const parseProject = (input: unknown) => Schema.decodeUnknownSync(ProjectState)(input)
const main = async () => {
  const args = Schema.decodeUnknownSync(Arguments)(process.argv[2])
  const { accountUuid, client } = await connectIntegrationHuly()
  try {
    const project = parseProject(
      await client.findOne<Project>(tracker.class.Project, hulyQuery<Project>({ identifier: args.project }))
    )
    const member = AccountUuid.make(accountUuid)
    const members = [...new Set([...project.members, member])].map(toAccountUuid)
    await client.updateDoc(tracker.class.Project, core.space.Space, toRef<Project>(project._id), {
      private: true,
      restricted: args.restricted,
      members
    })
    process.stdout.write(`${JSON.stringify(parseResult({ projectId: project._id }))}\n`)
  } finally {
    await client.close()
  }
}
void main().catch((cause: unknown) => {
  process.stderr.write(`${String(cause)}\n`)
  process.exitCode = 1
})
