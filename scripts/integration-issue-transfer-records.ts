// Fixture setup only. Root runs this after the complete 306–311 candidate is integrated.
import type { Employee, SocialIdentity } from "@hcengineering/contact"
import { ToDoPriority, type ToDo } from "@hcengineering/time"
import type { ActivityReference } from "@hcengineering/activity"
import type { AttachedDoc, Doc, TxOperations } from "@hcengineering/core"
import type { Document } from "@hcengineering/document"
import type { Issue } from "@hcengineering/tracker"
import { Schema } from "effect"
import { DocId, IssueId, ObjectClassName } from "../src/domain/schemas/shared.js"
import { activity, contact, documentPlugin, time, tracker } from "../src/huly/huly-plugins.js"
import { hulyQuery } from "../src/huly/operations/query-helpers.js"
import { toClassRef, toRef, toSocialIdentityRef } from "../src/huly/operations/sdk-boundary.js"
import { connectIntegrationHuly } from "./integration-huly-client.js"

const Arguments = Schema.fromJsonString(
  Schema.Union([
    Schema.Struct({ issue: IssueId, document: DocId, mode: Schema.Literals(["references", "unsupported"]) }),
    Schema.Struct({ mode: Schema.Literal("cleanup"), recordIds: Schema.Array(DocId) })
  ])
)
const Location = Schema.Struct({ _id: DocId, _class: ObjectClassName, space: DocId })
const Result = Schema.Struct({ recordIds: Schema.Array(DocId) })
const Identity = Schema.Struct({ attachedTo: DocId })
const parseIdentity = (input: unknown) => Schema.decodeUnknownSync(Identity)(input)
const parseResult = (input: unknown) => Schema.decodeUnknownSync(Result)(input)
const parseLocation = (input: unknown) => Schema.decodeUnknownSync(Location)(input)

const AttachedLocation = Schema.Struct({
  ...Location.fields,
  attachedTo: DocId,
  attachedToClass: ObjectClassName,
  collection: Schema.String
})
const parseAttachedLocation = (input: unknown) => Schema.decodeUnknownSync(AttachedLocation)(input)

const cleanupRecords = async (client: TxOperations, recordIds: ReadonlyArray<DocId>) => {
  const failures: Array<unknown> = []
  for (const id of recordIds) {
    let phase: "reference-read" | "todo-read" | "parse" | "class-check" | "remove" = "reference-read"
    try {
      // Base Doc has no storage domain; query only the two concrete fixture classes.
      const reference = await client.findOne<ActivityReference>(
        activity.class.ActivityReference,
        hulyQuery<ActivityReference>({ _id: toRef<ActivityReference>(id) })
      )
      const raw = reference ?? await (async () => {
        phase = "todo-read"
        return client.findOne<ToDo>(time.class.ToDo, hulyQuery<ToDo>({ _id: toRef<ToDo>(id) }))
      })()
      if (raw === undefined) continue
      phase = "parse"
      const record = parseAttachedLocation(raw)
      phase = "class-check"
      if (
        record._class !== ObjectClassName.make(activity.class.ActivityReference) &&
        record._class !== ObjectClassName.make(time.class.ToDo)
      )
        throw new Error(`Unexpected fixture record class for ${id}`)
      phase = "remove"
      await client.removeCollection<Doc, AttachedDoc>(
        toClassRef<AttachedDoc>(record._class),
        toRef(record.space),
        toRef<AttachedDoc>(record._id),
        toRef<Doc>(record.attachedTo),
        toClassRef<Doc>(record.attachedToClass),
        record.collection
      )
    } catch (cause) {
      failures.push(cause)
      process.stderr.write(`Fixture record cleanup failed: phase=${phase} record=${id}\n`)
    }
  }
  if (failures.length > 0) throw new Error(`Fixture record cleanup failed for ${failures.length} records`)
}

const main = async () => {
  const args = Schema.decodeUnknownSync(Arguments)(process.argv[2])
  const { client } = await connectIntegrationHuly()
  const recordIds: Array<DocId> = []
  let phase:
    | "cleanup"
    | "issue-read"
    | "identity-read"
    | "todo-create"
    | "document-read"
    | "outgoing-create"
    | "incoming-create" = "issue-read"
  try {
    if (args.mode === "cleanup") {
      phase = "cleanup"
      await cleanupRecords(client, args.recordIds)
      return
    }
    const issue = parseLocation(
      await client.findOne<Issue>(tracker.class.Issue, hulyQuery<Issue>({ _id: toRef<Issue>(args.issue) }))
    )
    if (args.mode === "unsupported") {
      // A real ordinary-model class whose task ownership is deliberately unaudited.
      phase = "identity-read"
      const identity = parseIdentity(
        await client.findOne<SocialIdentity>(
          contact.class.SocialIdentity,
          hulyQuery<SocialIdentity>({ _id: toSocialIdentityRef(client.user) })
        )
      )
      phase = "todo-create"
      const id = await client.addCollection<Issue, ToDo>(
        time.class.ToDo,
        toRef(issue.space),
        toRef<Issue>(issue._id),
        tracker.class.Issue,
        "todos",
        {
          title: "Unsupported transfer ownership fixture",
          doneOn: null,
          description: "",
          user: toRef<Employee>(identity.attachedTo),
          visibility: "public",
          workslots: 0,
          priority: ToDoPriority.NoPriority,
          rank: "0|hzzzzz:"
        }
      )
      recordIds.push(DocId.make(id))
      process.stdout.write(`${JSON.stringify(parseResult({ recordIds }))}\n`)
      return
    }
    phase = "document-read"
    const independent = parseLocation(
      await client.findOne<Document>(
        documentPlugin.class.Document,
        hulyQuery<Document>({ _id: toRef<Document>(args.document) })
      )
    )
    phase = "outgoing-create"
    for (const target of [independent, { ...independent, _id: DocId.make(`${args.issue}-dangling-target`) }]) {
      // TxOperations.addCollection sends the collection transaction without resolving its parent.
      recordIds.push(
        DocId.make(
          await client.addCollection<Doc, ActivityReference>(
            activity.class.ActivityReference,
            toRef(issue.space),
            toRef<Doc>(target._id),
            toClassRef<Doc>(target._class),
            "references",
            {
              srcDocId: toRef<Doc>(issue._id),
              srcDocClass: tracker.class.Issue,
              message: "Independent reference payload remains unchanged"
            }
          )
        )
      )
    }
    phase = "incoming-create"
    recordIds.push(
      DocId.make(
        await client.addCollection<Issue, ActivityReference>(
          activity.class.ActivityReference,
          toRef(independent.space),
          toRef<Issue>(issue._id),
          tracker.class.Issue,
          "references",
          {
            srcDocId: toRef<Doc>(independent._id),
            srcDocClass: toClassRef<Doc>(independent._class),
            message: "Incoming independent reference stays in its original space"
          }
        )
      )
    )
    process.stdout.write(`${JSON.stringify(parseResult({ recordIds }))}\n`)
  } catch (cause) {
    process.stderr.write(
      `Fixture record operation failed: phase=${phase} confirmedRecordIds=${JSON.stringify(recordIds)}\n`
    )
    try {
      await cleanupRecords(client, recordIds)
    } catch {
      /* cleanupRecords reports every failure; preserve the original cause. */
    }
    throw cause
  } finally {
    await client.close()
  }
}
void main().catch(() => {
  process.stderr.write("Integration fixture record operation failed\n")
  process.exitCode = 1
})
