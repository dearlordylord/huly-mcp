import { Schema } from "effect"
import type { Doc, TxOperations } from "@hcengineering/core"
import { activity, attachment, chunter, core, tags, tracker } from "../../src/huly/huly-plugins.js"
import { sdkFixture, findResult } from "./huly-sdk.js"

const LAST_SCOPE = -1

export const ownedRecord = (
  id: string,
  cls: string,
  owner = "root",
  collection = "comments",
  payload: Record<string, unknown> = {}
) => ({
  _id: id,
  _class: cls,
  space: "source",
  attachedTo: owner,
  attachedToClass: owner === "root" ? tracker.class.Issue : chunter.class.ChatMessage,
  collection,
  modifiedOn: 1,
  modifiedBy: "author",
  ...payload
})
const parents = new Map<string, string>([
  [String(chunter.class.ThreadMessage), String(chunter.class.ChatMessage)],
  [String(chunter.class.ChatMessage), String(activity.class.ActivityMessage)],
  [String(activity.class.DocUpdateMessage), String(activity.class.ActivityMessage)],
  [String(activity.class.ActivityInfoMessage), String(activity.class.ActivityMessage)],
  [String(activity.class.ActivityReference), String(activity.class.ActivityMessage)],
  [String(attachment.class.Photo), String(attachment.class.Attachment)],
  [String(attachment.class.Embedding), String(attachment.class.Attachment)]
])
const derived = (cls: string, parent: string): boolean =>
  cls === parent || (parents.has(cls) && derived(parents.get(cls) ?? "", parent))
const definitions = new Map<string, Map<string, string>>([
  [
    String(tracker.class.Issue),
    new Map([
      ["comments", String(chunter.class.ChatMessage)],
      ["attachments", String(attachment.class.Attachment)],
      ["labels", String(tags.class.TagReference)],
      ["reports", String(tracker.class.TimeSpendReport)]
    ])
  ],
  [String(chunter.class.ChatMessage), new Map([["attachments", String(attachment.class.Attachment)]])],
  [
    String(activity.class.ActivityMessage),
    new Map([
      ["reactions", String(activity.class.Reaction)],
      ["replies", String(activity.class.ActivityMessage)]
    ])
  ]
])
export const recordAdapterFixture = () => {
  const history = ownedRecord("history", String(activity.class.DocUpdateMessage), "root", "docUpdateMessages", {
    objectId: "root",
    objectClass: tracker.class.Issue,
    action: "create",
    createdBy: "author",
    createdOn: 1
  })
  const docs: Array<Record<string, unknown>> = [history]
  const classes = [
    ...parents.keys(),
    activity.class.Reaction,
    tags.class.TagReference,
    tracker.class.TimeSpendReport,
    attachment.class.Attachment,
    "unknown:class:Record",
    "unpersisted"
  ]
  const state = {
    refused: false,
    incomplete: false,
    failRead: false,
    invalidMetadata: false,
    duplicate: false,
    conflict: false
  }
  const updates: Array<ReadonlyArray<unknown>> = []
  const conditions: Array<unknown> = []
  const scopes: Array<string | undefined> = []
  const exclusions: Array<{ cls: string; query: Record<string, unknown> }> = []
  const apply = {
    match: (_class: unknown, query: unknown) => {
      conditions.push(query)
    },
    notMatch: (cls: string, query: Record<string, unknown>) => {
      conditions.push(query)
      exclusions.push({ cls, query })
    },
    updateDoc: async (...args: ReadonlyArray<unknown>) => {
      updates.push(args)
      return {}
    },
    commit: async () => ({
      result:
        scopes.at(LAST_SCOPE) === undefined ||
        (!state.refused &&
          !exclusions.some(({ cls, query }) =>
            docs.some((doc) => derived(String(doc._class), cls) && queryMatches(doc, query))
          ))
    })
  }
  const client = sdkFixture<TxOperations>({
    getHierarchy: () => ({
      getAllAttributes: (cls: string) => {
        if (state.invalidMetadata) return new Map([["bad", { type: { _class: core.class.Collection } }]])
        const edges = new Map<string, unknown>([["scalar", { type: { _class: core.class.TypeString } }]])
        for (const [base, declared] of definitions) {
          if (derived(cls, base))
            for (const [name, of] of declared) edges.set(name, { type: { _class: core.class.Collection, of } })
        }
        return edges
      },
      isDerived: derived,
      getDescendants: () => classes,
      findDomain: (cls: string) => (cls === "unpersisted" ? undefined : "test")
    }),
    findAll: async (cls: string, query: Record<string, unknown>) => {
      if (state.failRead) throw new Error("Unavailable read")
      const rows = docs.filter(
        (doc) => derived(String(doc._class), cls) && Object.entries(query).every(([key, value]) => doc[key] === value)
      )
      const duplicated = state.duplicate
        ? rows.flatMap((row) => [row, state.conflict ? { ...row, modifiedOn: 2 } : row])
        : rows
      const result = findResult(duplicated.map((doc) => sdkFixture<Doc>(doc)))
      if (state.incomplete) result.total = 10_002
      return result
    },
    apply: (scope: string | undefined) => {
      scopes.push(scope)
      return apply
    }
  })
  return { client, docs, history, state, updates, conditions, scopes }
}
const queryMatches = (doc: Record<string, unknown>, query: Record<string, unknown>) =>
  Object.entries(query).every(([key, expected]) => {
    const value = doc[key]
    if (typeof expected !== "object" || expected === null) return value === expected
    const operation = Schema.decodeUnknownSync(
      Schema.Struct({
        $in: Schema.optionalKey(Schema.Array(Schema.Unknown)),
        $nin: Schema.optionalKey(Schema.Array(Schema.Unknown)),
        $ne: Schema.optionalKey(Schema.Unknown)
      })
    )(expected)
    return (
      (operation.$in === undefined || operation.$in.includes(value)) &&
      (operation.$nin === undefined || !operation.$nin.includes(value)) &&
      (!Reflect.has(operation, "$ne") || value !== operation.$ne)
    )
  })

export const attachmentPayload = { name: "file", file: "blob-stable", size: 5, type: "text/plain", lastModified: 1 }
