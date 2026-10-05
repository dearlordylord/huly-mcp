import { execFileSync } from "node:child_process"

import { Schema } from "effect"
import { describe, expect, it } from "vitest"

import { DocId, Timestamp } from "../../src/domain/schemas/shared.js"
import { SocialIdentityId } from "../../src/domain/schemas/person-administration.js"

const sourceSpace = DocId.make("source")
const destinationSpace = DocId.make("destination")
const originalModifiedOn = Timestamp.make(2)
const migrationModifiedOn = Timestamp.make(10)
const originalEditor = SocialIdentityId.make("old-editor")
const migrationAuthor = SocialIdentityId.make("migration-author")

const encode = Schema.encodeSync(Schema.fromJsonString(Schema.Json))
const parse = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({ valid: Schema.Boolean, lastModificationEvidence: Schema.Literals(["observed", "unavailable"]) })
  )
)
const payload = {
  _id: "record",
  _class: "chunter:class:ChatMessage",
  attachedTo: "issue",
  attachedToClass: "tracker:class:Issue",
  collection: "comments",
  createdBy: "original-author",
  createdOn: 1,
  message: "Preserved content"
}
const record = (space: DocId, modifiedOn: Timestamp, modifiedBy: SocialIdentityId, message = payload.message) => ({
  ...payload,
  space,
  modifiedOn,
  modifiedBy,
  snapshot: encode({ ...payload, message, modifiedOn, modifiedBy })
})
const oldRecord = record(sourceSpace, originalModifiedOn, originalEditor)
const movedRecord = record(destinationSpace, migrationModifiedOn, migrationAuthor)
const owner = (space: DocId, records: Schema.Json[], incomingReferences: Schema.Json[] = []) => ({
  issue: {
    _id: "issue",
    space,
    attachedTo: "tracker:ids:NoParent",
    number: space === sourceSpace ? 1 : 2,
    identifier: space === sourceSpace ? "SRC-1" : "DST-2"
  },
  owned: { records },
  incomingReferences
})
const before = { issues: [owner(sourceSpace, [oldRecord])] }
const receipt = {
  objectId: "record",
  objectClass: payload._class,
  objectSpace: "source",
  operations: { space: "destination" },
  modifiedOn: 10,
  modifiedBy: "migration-author"
}
const check = (after: Schema.Json) =>
  parse(
    execFileSync(
      "jq",
      [
        "-L",
        "scripts",
        "-c",
        "--argjson",
        "before",
        encode(before),
        "--arg",
        "root",
        "issue",
        "-f",
        "scripts/issue-movement-concurrency/assert-record-preservation.jq"
      ],
      { input: encode(after), encoding: "utf8" }
    ).trim()
  )

// Real fixture assertions execute in jq; synthetic state does not claim any Huly write.
describe("concurrency fixture record evidence", () => {
  it("keeps source refusals fully unchanged", () => {
    expect(check({ issues: [owner(sourceSpace, [oldRecord])] })).toEqual({
      valid: true,
      lastModificationEvidence: "observed"
    })
  })
  it("authenticates migration metadata using exact persisted transaction evidence", () => {
    expect(check({ issues: [owner(destinationSpace, [movedRecord])], migrationTransactions: [receipt] })).toEqual({
      valid: true,
      lastModificationEvidence: "observed"
    })
  })
  it("reports unavailable metadata while independently proving immutable payload after a lost reply", () => {
    expect(check({ issues: [owner(destinationSpace, [movedRecord])], migrationTransactions: [] })).toEqual({
      valid: true,
      lastModificationEvidence: "unavailable"
    })
  })
  it("rejects corrupted content even when metadata evidence is unavailable", () => {
    expect(
      check({
        issues: [
          owner(destinationSpace, [record(destinationSpace, migrationModifiedOn, migrationAuthor, "Changed content")])
        ]
      }).valid
    ).toBe(false)
  })
  it("rejects contradictory transaction evidence", () => {
    expect(
      check({
        issues: [owner(destinationSpace, [movedRecord])],
        migrationTransactions: [{ ...receipt, modifiedOn: 9 }]
      }).valid
    ).toBe(false)
  })
  it("preserves incoming independent reference routing", () => {
    expect(check({ issues: [owner(sourceSpace, [oldRecord], [{ _id: "incoming", space: "changed" }])] }).valid).toBe(
      false
    )
  })
})
