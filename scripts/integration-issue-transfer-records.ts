// Fixture setup only. Root runs this after the complete 306–311 candidate is integrated.
import type { Employee, SocialIdentity } from "@hcengineering/contact"
import { ToDoPriority } from "@hcengineering/time"
import type { ActivityReference } from "@hcengineering/activity"
import type { Doc } from "@hcengineering/core"
import type { Document } from "@hcengineering/document"
import type { Issue } from "@hcengineering/tracker"
import { Schema } from "effect"
import { DocId, IssueId, ObjectClassName } from "../src/domain/schemas/shared.js"
import { activity, contact, documentPlugin, time, tracker } from "../src/huly/huly-plugins.js"
import { hulyQuery } from "../src/huly/operations/query-helpers.js"
import { toClassRef, toRef, toSocialIdentityRef } from "../src/huly/operations/sdk-boundary.js"
import { connectIntegrationHuly } from "./integration-huly-client.js"

const Arguments = Schema.fromJsonString(
  Schema.Struct({ issue: IssueId, document: DocId, mode: Schema.Literals(["references", "unsupported"]) })
)
const Location = Schema.Struct({ _id: DocId, _class: ObjectClassName, space: DocId })
const Result = Schema.Struct({ recordIds: Schema.Array(DocId) })
const parseLocation = (input: unknown) => Schema.decodeUnknownSync(Location)(input)

const main = async () => {
  const args = Schema.decodeUnknownSync(Arguments)(process.argv[2])
  const { client } = await connectIntegrationHuly()
  try {
    const issue = parseLocation(
      await client.findOne<Issue>(tracker.class.Issue, hulyQuery<Issue>({ _id: toRef<Issue>(args.issue) }))
    )
    if (args.mode === "unsupported") {
      // A real ordinary-model class whose task ownership is deliberately unaudited.
      const social = parseLocation(
        await client.findOne<SocialIdentity>(
          contact.class.SocialIdentity,
          hulyQuery<SocialIdentity>({ _id: toSocialIdentityRef(client.user) })
        )
      )
      const identity = Schema.decodeUnknownSync(Schema.Struct({ attachedTo: DocId }))(
        await client.findOne<SocialIdentity>(
          contact.class.SocialIdentity,
          hulyQuery<SocialIdentity>({ _id: toRef<SocialIdentity>(social._id) })
        )
      )
      const id = await client.createDoc(time.class.ToDo, toRef(issue.space), {
        attachedTo: toRef<Doc>(issue._id),
        attachedToClass: tracker.class.Issue,
        collection: "todos",
        title: "Unsupported transfer ownership fixture",
        doneOn: null,
        description: "",
        user: toRef<Employee>(identity.attachedTo),
        visibility: "public",
        workslots: 0,
        priority: ToDoPriority.NoPriority,
        rank: "0|hzzzzz:"
      })
      process.stdout.write(`${JSON.stringify(Schema.decodeUnknownSync(Result)({ recordIds: [id] }))}\n`)
      return
    }
    const independent = parseLocation(
      await client.findOne<Document>(
        documentPlugin.class.Document,
        hulyQuery<Document>({ _id: toRef<Document>(args.document) })
      )
    )
    const recordIds: Array<string> = []
    for (const target of [independent, { ...independent, _id: DocId.make(`${args.issue}-dangling-target`) }]) {
      // createDoc preserves dangling target fixtures without SDK addCollection's read-after-write resolution.
      recordIds.push(
        await client.createDoc<ActivityReference>(activity.class.ActivityReference, toRef(issue.space), {
          attachedTo: toRef<Doc>(target._id),
          attachedToClass: toClassRef<Doc>(target._class),
          collection: "references",
          srcDocId: toRef<Doc>(issue._id),
          srcDocClass: tracker.class.Issue,
          message: "Independent reference payload remains unchanged"
        })
      )
    }
    recordIds.push(
      await client.createDoc<ActivityReference>(activity.class.ActivityReference, toRef(independent.space), {
        attachedTo: toRef<Doc>(issue._id),
        attachedToClass: tracker.class.Issue,
        collection: "references",
        srcDocId: toRef<Doc>(independent._id),
        srcDocClass: toClassRef<Doc>(independent._class),
        message: "Incoming independent reference stays in its original space"
      })
    )
    process.stdout.write(`${JSON.stringify(Schema.decodeUnknownSync(Result)({ recordIds }))}\n`)
  } finally {
    await client.close()
  }
}
void main().catch((cause: unknown) => {
  process.stderr.write(`${String(cause)}\n`)
  process.exitCode = 1
})
