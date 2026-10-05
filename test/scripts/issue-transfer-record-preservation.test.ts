import { execFileSync } from "node:child_process"

import { Schema } from "effect"
import { describe, expect, it } from "vitest"

const encodeInput = Schema.encodeSync(Schema.fromJsonString(Schema.Json))
const parseBoolean = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Boolean))
const beforeIssue = { _id: "issue", space: "source", attachedTo: "old-parent", number: 1, identifier: "SRC-1" }
const afterIssue = { ...beforeIssue, space: "destination", attachedTo: "new-parent", number: 2, identifier: "DST-2" }
const content = { createdBy: "original-author", createdOn: 1, message: "Preserved content" }
const beforeRecord = {
  _id: "record",
  _class: "chunter:class:ChatMessage",
  space: "source",
  modifiedOn: 2,
  modifiedBy: "previous-author",
  snapshot: JSON.stringify({ ...content, modifiedOn: 2, modifiedBy: "previous-author" })
}
const afterRecord = {
  ...beforeRecord,
  space: "destination",
  modifiedOn: 10,
  modifiedBy: "migration-author",
  snapshot: JSON.stringify({ ...content, modifiedOn: 10, modifiedBy: "migration-author" })
}
const attributes = [
  { key: "attachedTo", attrClass: "tracker:class:Issue", value: afterIssue.attachedTo },
  { key: "space", attrClass: "tracker:class:Project", value: afterIssue.space },
  { key: "number", attrClass: "core:class:TypeNumber", value: afterIssue.number },
  { key: "identifier", attrClass: "core:class:TypeString", value: afterIssue.identifier }
]
const messages = attributes.map(({ attrClass, key, value }) => ({
  _id: `history-${key}`,
  _class: "activity:class:DocUpdateMessage",
  kind: "history",
  attachedTo: "issue",
  attachedToClass: "tracker:class:Issue",
  collection: "docUpdateMessages",
  space: "destination",
  modifiedOn: 10,
  modifiedBy: "migration-author",
  history: {
    objectId: "issue",
    objectClass: "tracker:class:Issue",
    action: "update",
    txId: "new-issue-tx",
    createdOn: 10,
    createdBy: "migration-author",
    attributeUpdates: JSON.stringify({ attrKey: key, attrClass, set: [value], added: [], removed: [], isMixin: false })
  }
}))
const before = { issue: beforeIssue, owned: { records: [beforeRecord] } }
const after = { issue: afterIssue, owned: { records: [afterRecord, ...messages] } }
const check = (input: Schema.Json) =>
  parseBoolean(
    execFileSync(
      "jq",
      [
        "-L",
        "scripts",
        "-c",
        'include "issue-transfer-record-preservation"; issue_history_anchor(.before; .after) as $anchor | preserved_record(.old; .new; .transactions; $anchor)'
      ],
      { input: encodeInput(input), encoding: "utf8" }
    ).trim()
  )

// Synthetic independent-oracle cases execute the real jq assertion; they do not claim Huly writes.
describe("fixture record metadata evidence", () => {
  it("authenticates changed last author while preserving original created metadata and content", () => {
    expect(check({ before, after, old: beforeRecord, new: afterRecord, transactions: [] })).toBe(true)
  })
  it("authenticates a cross-project move whose allocated number equals its old number", () => {
    const equalNumber = {
      ...after,
      issue: { ...afterIssue, number: beforeIssue.number },
      owned: { records: [afterRecord, ...messages.filter((message) => message._id !== "history-number")] }
    }
    expect(check({ before, after: equalNumber, old: beforeRecord, new: afterRecord, transactions: [] })).toBe(true)
  })
  it("rejects history attached to a different owner or collection", () => {
    for (const routing of [
      { attachedTo: "other-issue" },
      { attachedToClass: "document:class:Document" },
      { collection: "references" }
    ]) {
      const wrong = messages.map((message) => ({ ...message, ...routing }))
      expect(
        check({
          before,
          after: { ...after, owned: { records: [afterRecord, ...wrong] } },
          old: beforeRecord,
          new: afterRecord,
          transactions: []
        })
      ).toBe(false)
    }
  })
  it("rejects mixin and collection-update histories", () => {
    const mixins = messages.map((message) => ({
      ...message,
      history: {
        ...message.history,
        attributeUpdates: JSON.stringify({
          ...Schema.decodeUnknownSync(Schema.fromJsonString(Schema.JsonObject))(message.history.attributeUpdates),
          isMixin: true
        })
      }
    }))
    const collectionUpdates = messages.map((message) => ({
      ...message,
      history: { ...message.history, updateCollection: "children" }
    }))
    for (const wrong of [mixins, collectionUpdates])
      expect(
        check({
          before,
          after: { ...after, owned: { records: [afterRecord, ...wrong] } },
          old: beforeRecord,
          new: afterRecord,
          transactions: []
        })
      ).toBe(false)
  })
  it("rejects an existing history transaction reused as a migration anchor", () => {
    const existing = { ...messages[0], _id: "old-history", kind: "history", history: { txId: "new-issue-tx" } }
    expect(
      check({
        before: { ...before, owned: { records: [beforeRecord, existing] } },
        after,
        old: beforeRecord,
        new: afterRecord,
        transactions: []
      })
    ).toBe(false)
  })
  it("rejects a contradictory direct transaction despite a valid issue history anchor", () => {
    const transaction = {
      objectId: "record",
      objectClass: afterRecord._class,
      objectSpace: "source",
      operations: { space: "destination" },
      modifiedOn: 9,
      modifiedBy: "migration-author"
    }
    expect(check({ before, after, old: beforeRecord, new: afterRecord, transactions: [transaction] })).toBe(false)
  })
  it("rejects history that claims a different destination identifier", () => {
    const wrong = messages.map((message) =>
      message._id === "history-identifier"
        ? {
            ...message,
            history: {
              ...message.history,
              attributeUpdates: JSON.stringify({
                attrKey: "identifier",
                attrClass: "core:class:TypeString",
                set: ["DST-999"],
                added: [],
                removed: [],
                isMixin: false
              })
            }
          }
        : message
    )
    expect(
      check({
        before,
        after: { ...after, owned: { records: [afterRecord, ...wrong] } },
        old: beforeRecord,
        new: afterRecord,
        transactions: []
      })
    ).toBe(false)
  })
  it("rejects inconsistent server stamps across otherwise matching movement history", () => {
    const mixed = messages.map((message, index) =>
      index === 0 ? { ...message, modifiedOn: 11, history: { ...message.history, createdOn: 11 } } : message
    )
    expect(
      check({
        before,
        after: { ...after, owned: { records: [afterRecord, ...mixed] } },
        old: beforeRecord,
        new: afterRecord,
        transactions: []
      })
    ).toBe(false)
  })
  it("rejects content and original author changes despite authenticated last modification metadata", () => {
    const corrupted = {
      ...afterRecord,
      snapshot: JSON.stringify({
        ...content,
        createdBy: "different-original-author",
        message: "Changed content",
        modifiedOn: 10,
        modifiedBy: "migration-author"
      })
    }
    expect(check({ before, after, old: beforeRecord, new: corrupted, transactions: [] })).toBe(false)
  })
})
