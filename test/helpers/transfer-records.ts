import { Schema } from "effect"
import type { Doc, TxOperations } from "@hcengineering/core"
import { activity, attachment, chunter, core, tags, tracker } from "../../src/huly/huly-plugins.js"
import { ObjectClassName } from "../../src/domain/schemas/shared.js"
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
const parseClassName = Schema.decodeUnknownSync(ObjectClassName)
const parents = new Map<ObjectClassName, ObjectClassName>(
  Schema.decodeUnknownSync(Schema.Array(Schema.Tuple([ObjectClassName, ObjectClassName])))([
    ["tracker:class:CustomIssue", String(tracker.class.Issue)],
    [String(chunter.class.ThreadMessage), String(chunter.class.ChatMessage)],
    [String(chunter.class.ChatMessage), String(activity.class.ActivityMessage)],
    [String(activity.class.DocUpdateMessage), String(activity.class.ActivityMessage)],
    [String(activity.class.ActivityInfoMessage), String(activity.class.ActivityMessage)],
    [String(activity.class.ActivityReference), String(activity.class.ActivityMessage)],
    [String(attachment.class.Photo), String(attachment.class.Attachment)],
    [String(attachment.class.Embedding), String(attachment.class.Attachment)]
  ])
)
const derived = (
  cls: ObjectClassName,
  parent: ObjectClassName,
  modelParents: ReadonlyMap<ObjectClassName, ObjectClassName>
): boolean => {
  const ancestor = modelParents.get(cls)
  return cls === parent || (ancestor !== undefined && derived(ancestor, parent, modelParents))
}
const definitions = new Map<string, Map<string, string>>([
  [
    String(tracker.class.Issue),
    new Map([
      ["subIssues", String(tracker.class.Issue)],
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
export const recordAdapterFixture = (
  requireMatches = false,
  additionalParents: ReadonlyMap<ObjectClassName, ObjectClassName> = new Map<ObjectClassName, ObjectClassName>()
) => {
  const modelParents = new Map<ObjectClassName, ObjectClassName>([...parents, ...additionalParents])
  // This fixture copies its parent graph once; derivations cannot change within it.
  const derivations = new Map<unknown, Map<unknown, boolean>>()
  const isDerived = (cls: unknown, parent: unknown): boolean => {
    const cached = derivations.get(cls)?.get(parent)
    if (cached !== undefined) return cached
    const result = derived(parseClassName(cls), parseClassName(parent), modelParents)
    const ancestors = derivations.get(cls) ?? new Map<unknown, boolean>()
    ancestors.set(parent, result)
    derivations.set(cls, ancestors)
    return result
  }
  const history = ownedRecord("history", String(activity.class.DocUpdateMessage), "root", "docUpdateMessages", {
    objectId: "root",
    objectClass: tracker.class.Issue,
    action: "create",
    createdBy: "author",
    createdOn: 1
  })
  const docs: Array<Record<string, unknown>> = [history]
  const classes = [
    ...modelParents.keys(),
    activity.class.Reaction,
    tags.class.TagReference,
    tracker.class.TimeSpendReport,
    attachment.class.Attachment,
    "unknown:class:Record",
    "unpersisted"
  ]
  const state = {
    refused: false,
    rootClass: String(tracker.class.Issue),
    rootId: "root",
    incomplete: false,
    unknownTotal: false,
    unknownNestedTotal: false,
    invalidTotal: false,
    failRead: false,
    invalidMetadata: false,
    failModel: false,
    duplicate: false,
    conflict: false
  }
  const updates: Array<ReadonlyArray<unknown>> = []
  const conditions: Array<unknown> = []
  const scopes: Array<string | undefined> = []
  const matches: Array<{ cls: string; query: Record<string, unknown> }> = []
  const exclusions: Array<{ cls: string; query: Record<string, unknown> }> = []
  const apply = {
    match: (cls: unknown, query: unknown) => {
      conditions.push(query)
      matches.push({
        cls: Schema.decodeUnknownSync(Schema.String)(cls),
        query: Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(query)
      })
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
          (!requireMatches ||
            matches.every(({ cls, query }) =>
              docs.some((doc) => isDerived(String(doc._class), cls) && queryMatches(doc, query))
            )) &&
          !exclusions.some(({ cls, query }) =>
            docs.some((doc) => isDerived(String(doc._class), cls) && queryMatches(doc, query))
          ))
    })
  }
  const client = sdkFixture<TxOperations>({
    findOne: async () => {
      if (state.failRead) throw new Error("Unavailable root read")
      return sdkFixture<Doc>({ _id: state.rootId, _class: state.rootClass })
    },
    getHierarchy: () => ({
      getAllAttributes: (cls: string) => {
        if (state.failModel) throw new Error("Invalid model metadata")
        if (state.invalidMetadata) return new Map([["bad", { type: { _class: core.class.Collection } }]])
        const edges = new Map<string, unknown>([["scalar", { type: { _class: core.class.TypeString } }]])
        for (const [base, declared] of definitions) {
          if (isDerived(cls, base))
            for (const [name, of] of declared) edges.set(name, { type: { _class: core.class.Collection, of } })
        }
        return edges
      },
      isDerived,
      isMixin: () => false,
      getDescendants: () => classes,
      findDomain: (cls: string) => (cls === "unpersisted" ? undefined : "test")
    }),
    findAll: async (cls: string, query: Record<string, unknown>) => {
      if (state.failRead) throw new Error("Unavailable read")
      const rows = docs.filter(
        (doc) => isDerived(String(doc._class), cls) && Object.entries(query).every(([key, value]) => doc[key] === value)
      )
      const duplicated = state.duplicate
        ? rows.flatMap((row) => [row, state.conflict ? { ...row, modifiedOn: 2 } : row])
        : rows
      const result = findResult(duplicated.map((doc) => sdkFixture<Doc>(doc)))
      if (state.incomplete) result.total = 10_002
      if (state.unknownTotal || (state.unknownNestedTotal && query.attachedTo === history._id)) result.total = -1
      if (state.invalidTotal) result.total = -2
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
        $ne: Schema.optionalKey(Schema.Unknown),
        $exists: Schema.optionalKey(Schema.Boolean)
      })
    )(expected)
    return (
      (operation.$in === undefined || operation.$in.includes(value)) &&
      (operation.$nin === undefined || !operation.$nin.includes(value)) &&
      (!Reflect.has(operation, "$ne") || value !== operation.$ne) &&
      (operation.$exists === undefined || operation.$exists === (value !== undefined))
    )
  })

export const attachmentPayload = { name: "file", file: "blob-stable", size: 5, type: "text/plain", lastModified: 1 }
