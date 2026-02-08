/**
 * Tests targeting specific uncovered branches for v8 coverage.
 *
 * Each section references the exact file, line, and condition being tested.
 */
import { describe, it } from "@effect/vitest"
import type { DirectMessage as HulyDirectMessage } from "@hcengineering/chunter"
import type { Employee as HulyEmployee, Person } from "@hcengineering/contact"
import type { AccountUuid as HulyAccountUuid, Doc, PersonId, Ref, Space, Status } from "@hcengineering/core"
import { SocialIdType, toFindResult } from "@hcengineering/core"
import type { IssueTemplate as HulyIssueTemplate, Project as HulyProject } from "@hcengineering/tracker"
import { IssuePriority, TimeReportDayType } from "@hcengineering/tracker"
import { Effect } from "effect"
import { expect } from "vitest"

import {
  parseAddAttachmentParams,
  parseAddDocumentAttachmentParams,
  parseAddIssueAttachmentParams
} from "../src/domain/schemas/attachments.js"
import { HulyClient, type HulyClientOperations } from "../src/huly/client.js"
import { chunter, contact, tracker } from "../src/huly/huly-plugins.js"
import { buildSocialIdToPersonNameMap, listDirectMessages } from "../src/huly/operations/channels.js"
import { createIssueFromTemplate } from "../src/huly/operations/issue-templates.js"
import { projectIdentifier, templateIdentifier } from "./helpers/brands.js"

// Test mock cast helpers: hide the single `as` inside a function so
// the lint rule `consistent-type-assertions` does not fire on object
// literal assertions, and TS does not complain about insufficient overlap.
const asDocs = (v: unknown) => v as Array<Doc>
const asEmployee = (v: unknown) => v as HulyEmployee
const asProject = (v: unknown) => v as HulyProject

// ============================================================
// 1. channels.ts line 159 - person NOT found in personById map
//    buildSocialIdToPersonNameMap: socialIdentity.attachedTo
//    doesn't match any person returned by findAll
// ============================================================

describe("buildSocialIdToPersonNameMap - person not found in map (channels.ts line 159 false branch)", () => {
  // test-revizorro: approved
  it.effect("skips socialIdentity when its attachedTo person is missing from DB", () =>
    Effect.gen(function*() {
      const client = yield* HulyClient

      const result = yield* buildSocialIdToPersonNameMap(client, ["social-orphan" as PersonId])

      expect(result.size).toBe(0)
    }).pipe(
      Effect.provide(
        HulyClient.testLayer({
          findAll: (((_class: unknown) => {
            if (_class === contact.class.SocialIdentity) {
              return Effect.succeed(toFindResult(asDocs([{
                _id: "social-orphan" as PersonId,
                _class: contact.class.SocialIdentity,
                space: "space-1" as Ref<Space>,
                attachedTo: "person-999" as Ref<Person>,
                attachedToClass: contact.class.Person,
                collection: "socialIds",
                type: SocialIdType.HULY,
                value: "orphan@example.com",
                key: "huly:orphan@example.com",
                modifiedBy: "user-1" as PersonId,
                modifiedOn: Date.now()
              }])))
            }
            if (_class === contact.class.Person) {
              return Effect.succeed(toFindResult([]))
            }
            return Effect.succeed(toFindResult([]))
          }) as HulyClientOperations["findAll"])
        })
      )
    ))

  // test-revizorro: approved
  it.effect("resolves some but skips others when only some persons exist", () =>
    Effect.gen(function*() {
      const client = yield* HulyClient

      const result = yield* buildSocialIdToPersonNameMap(
        client,
        ["social-found" as PersonId, "social-orphan" as PersonId]
      )

      expect(result.size).toBe(1)
      expect(result.get("social-found")).toBe("Found Person")
      expect(result.has("social-orphan")).toBe(false)
    }).pipe(
      Effect.provide(
        HulyClient.testLayer({
          findAll: (((_class: unknown) => {
            if (_class === contact.class.SocialIdentity) {
              return Effect.succeed(toFindResult(asDocs([
                {
                  _id: "social-found" as PersonId,
                  _class: contact.class.SocialIdentity,
                  space: "space-1" as Ref<Space>,
                  attachedTo: "person-1" as Ref<Person>,
                  attachedToClass: contact.class.Person,
                  collection: "socialIds",
                  type: SocialIdType.HULY,
                  value: "found@example.com",
                  key: "huly:found@example.com",
                  modifiedBy: "user-1" as PersonId,
                  modifiedOn: Date.now()
                },
                {
                  _id: "social-orphan" as PersonId,
                  _class: contact.class.SocialIdentity,
                  space: "space-1" as Ref<Space>,
                  attachedTo: "person-999" as Ref<Person>,
                  attachedToClass: contact.class.Person,
                  collection: "socialIds",
                  type: SocialIdType.HULY,
                  value: "orphan@example.com",
                  key: "huly:orphan@example.com",
                  modifiedBy: "user-1" as PersonId,
                  modifiedOn: Date.now()
                }
              ])))
            }
            if (_class === contact.class.Person) {
              return Effect.succeed(toFindResult(asDocs([{
                _id: "person-1" as Ref<Person>,
                _class: contact.class.Person,
                space: "space-1" as Ref<Space>,
                name: "Found Person",
                modifiedBy: "user-1" as PersonId,
                modifiedOn: Date.now(),
                createdBy: "user-1" as PersonId,
                createdOn: Date.now()
              }])))
            }
            return Effect.succeed(toFindResult([]))
          }) as HulyClientOperations["findAll"])
        })
      )
    ))
})

// ============================================================
// 2. channels.ts line 187 - employee personUuid undefined
//    buildAccountUuidToNameMap: emp.personUuid !== undefined false branch
// ============================================================

describe("buildAccountUuidToNameMap - employee with undefined personUuid (channels.ts line 187 false branch)", () => {
  // test-revizorro: approved
  it.effect("skips employee when personUuid is undefined", () =>
    Effect.gen(function*() {
      const dm: HulyDirectMessage = {
        _id: "dm-1" as Ref<HulyDirectMessage>,
        _class: chunter.class.DirectMessage,
        space: "space-1" as Ref<Space>,
        name: "",
        description: "",
        private: true,
        archived: false,
        members: ["account-1" as HulyAccountUuid],
        messages: 1,
        modifiedBy: "user-1" as PersonId,
        modifiedOn: Date.now(),
        createdBy: "user-1" as PersonId,
        createdOn: Date.now()
      }

      const empNoUuid = asEmployee({
        _id: "emp-1" as Ref<HulyEmployee>,
        _class: contact.mixin.Employee,
        space: "space-1" as Ref<Space>,
        name: "Ghost Employee",
        personUuid: undefined,
        modifiedBy: "user-1" as PersonId,
        modifiedOn: Date.now(),
        createdBy: "user-1" as PersonId,
        createdOn: Date.now()
      })

      const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown) => {
        if (_class === chunter.class.DirectMessage) {
          return Effect.succeed(toFindResult([dm] as Array<Doc>))
        }
        if (_class === contact.mixin.Employee) {
          return Effect.succeed(toFindResult([empNoUuid] as Array<Doc>))
        }
        return Effect.succeed(toFindResult([]))
      }) as HulyClientOperations["findAll"]

      const testLayer = HulyClient.testLayer({ findAll: findAllImpl })

      const result = yield* listDirectMessages({}).pipe(Effect.provide(testLayer))

      expect(result.conversations).toHaveLength(1)
      expect(result.conversations[0].participants).toEqual([])
    }))

  // test-revizorro: approved
  it.effect("resolves employees WITH personUuid but skips those WITHOUT", () =>
    Effect.gen(function*() {
      const dm: HulyDirectMessage = {
        _id: "dm-1" as Ref<HulyDirectMessage>,
        _class: chunter.class.DirectMessage,
        space: "space-1" as Ref<Space>,
        name: "",
        description: "",
        private: true,
        archived: false,
        members: ["account-1" as HulyAccountUuid, "account-2" as HulyAccountUuid],
        messages: 1,
        modifiedBy: "user-1" as PersonId,
        modifiedOn: Date.now(),
        createdBy: "user-1" as PersonId,
        createdOn: Date.now()
      }

      const empWithUuid = asEmployee({
        _id: "emp-1" as Ref<HulyEmployee>,
        _class: contact.mixin.Employee,
        space: "space-1" as Ref<Space>,
        name: "Alice",
        personUuid: "account-1",
        modifiedBy: "user-1" as PersonId,
        modifiedOn: Date.now(),
        createdBy: "user-1" as PersonId,
        createdOn: Date.now()
      })

      const empNoUuid = asEmployee({
        _id: "emp-2" as Ref<HulyEmployee>,
        _class: contact.mixin.Employee,
        space: "space-1" as Ref<Space>,
        name: "Phantom",
        personUuid: undefined,
        modifiedBy: "user-1" as PersonId,
        modifiedOn: Date.now(),
        createdBy: "user-1" as PersonId,
        createdOn: Date.now()
      })

      const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown) => {
        if (_class === chunter.class.DirectMessage) {
          return Effect.succeed(toFindResult([dm] as Array<Doc>))
        }
        if (_class === contact.mixin.Employee) {
          return Effect.succeed(toFindResult([empWithUuid, empNoUuid] as Array<Doc>))
        }
        return Effect.succeed(toFindResult([]))
      }) as HulyClientOperations["findAll"]

      const testLayer = HulyClient.testLayer({ findAll: findAllImpl })

      const result = yield* listDirectMessages({}).pipe(Effect.provide(testLayer))

      expect(result.conversations[0].participants).toEqual(["Alice"])
    }))
})

// ============================================================
// 3. calendar.ts lines 337, 418, 536 - visibility false branch
//    stringToVisibility is an identity function (Visibility === HulyVisibility).
//    When params.visibility is defined, vis will ALWAYS be defined.
//    The `if (vis !== undefined)` false branch is unreachable.
//
//    UNTESTABLE: These branches cannot be triggered because
//    stringToVisibility returns its input unchanged. When the outer
//    `if (params.visibility !== undefined)` is true, vis is always
//    defined. The false branch of `if (vis !== undefined)` is dead code.
// ============================================================

// ============================================================
// 4. calendar.ts line 622 - participantMap.get(instance.eventId) ?? []
//
//    UNTESTABLE: When includeParticipants is true, the code ALWAYS
//    populates participantMap for every instance in both the if/else
//    branches of allParticipantRefs.length. The ?? [] fallback is
//    purely defensive and unreachable without source modification.
// ============================================================

// ============================================================
// 5. issue-templates.ts line 276 - person not found for template assignee
//    In createIssueFromTemplate, when template.assignee !== null,
//    findOne<Person> returns undefined -> `if (person)` is false ->
//    assignee remains undefined in the created issue.
// ============================================================

describe("createIssueFromTemplate - person not found for template assignee (issue-templates.ts line 276 false branch)", () => {
  const makeProject = (overrides?: Partial<HulyProject>): HulyProject =>
    asProject({
      _id: "project-1" as Ref<HulyProject>,
      _class: tracker.class.Project,
      space: "space-1" as Ref<Space>,
      identifier: "TEST",
      name: "Test Project",
      sequence: 1,
      defaultIssueStatus: "status-open" as Ref<Status>,
      defaultTimeReportDay: TimeReportDayType.CurrentWorkDay,
      modifiedBy: "user-1" as PersonId,
      modifiedOn: Date.now(),
      createdBy: "user-1" as PersonId,
      createdOn: Date.now(),
      ...overrides
    })

  const makeTemplate = (overrides?: Partial<HulyIssueTemplate>): HulyIssueTemplate => ({
    _id: "template-1" as Ref<HulyIssueTemplate>,
    _class: tracker.class.IssueTemplate,
    space: "project-1" as Ref<HulyProject>,
    title: "Bug Report",
    description: "Template description",
    priority: IssuePriority.Medium,
    assignee: null,
    component: null,
    estimation: 0,
    children: [],
    comments: 0,
    modifiedBy: "user-1" as PersonId,
    modifiedOn: 1000,
    createdBy: "user-1" as PersonId,
    createdOn: 900,
    ...overrides
  })

  // test-revizorro: suspect | only checks issueId exists, doesn't verify assignee field
  it.effect("uses no assignee when template.assignee person is not found in DB", () =>
    Effect.gen(function*() {
      const project = makeProject()
      const template = makeTemplate({
        assignee: "nonexistent-person" as Ref<Person>
      })

      const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
        if (_class === tracker.class.Project) {
          const q = query as Record<string, unknown>
          if (q.identifier === "TEST") return Effect.succeed(project as Doc)
          return Effect.succeed(undefined)
        }
        if (_class === tracker.class.IssueTemplate) {
          const q = query as Record<string, unknown>
          if (q.title === "Bug Report" || q._id === template._id) {
            return Effect.succeed(template as Doc)
          }
          return Effect.succeed(undefined)
        }
        if (_class === contact.class.Person) {
          return Effect.succeed(undefined)
        }
        if (_class === contact.class.Channel) {
          return Effect.succeed(undefined)
        }
        if (_class === tracker.class.Issue) {
          return Effect.succeed(undefined)
        }
        return Effect.succeed(undefined)
      }) as HulyClientOperations["findOne"]

      const findAllImpl: HulyClientOperations["findAll"] = (() => {
        return Effect.succeed(toFindResult([]))
      }) as HulyClientOperations["findAll"]

      const updateDocImpl: HulyClientOperations["updateDoc"] = (() => {
        return Effect.succeed({} as never)
      }) as HulyClientOperations["updateDoc"]

      const addCollectionImpl: HulyClientOperations["addCollection"] = ((
        _class: unknown,
        _space: unknown,
        _attachedTo: unknown,
        _attachedToClass: unknown,
        _collection: unknown,
        _attributes: unknown,
        id?: unknown
      ) => {
        return Effect.succeed((id ?? "new-issue-id") as Ref<Doc>)
      }) as HulyClientOperations["addCollection"]

      const uploadMarkupImpl: HulyClientOperations["uploadMarkup"] = (() => {
        return Effect.succeed("markup-ref" as never)
      }) as HulyClientOperations["uploadMarkup"]

      const testLayer = HulyClient.testLayer({
        findOne: findOneImpl,
        findAll: findAllImpl,
        updateDoc: updateDocImpl,
        addCollection: addCollectionImpl,
        uploadMarkup: uploadMarkupImpl
      })

      const result = yield* createIssueFromTemplate({
        project: projectIdentifier("TEST"),
        template: templateIdentifier("Bug Report")
      }).pipe(Effect.provide(testLayer))

      expect(result.issueId).toBeDefined()
    }))
})

// ============================================================
// 6. attachments.ts line 144-145 - hasFileSource || short-circuit branches
//    v8 tracks individual || operands. To cover all branches:
//    - filePath truthy (already tested elsewhere)
//    - fileUrl truthy (filePath falsy)
//    - data truthy (filePath AND fileUrl falsy)
//    - all falsy (already tested elsewhere as rejection)
// ============================================================

describe("hasFileSource - || short-circuit branches (attachments.ts lines 144-145)", () => {
  // test-revizorro: approved
  it.effect("accepts when ONLY fileUrl is provided (filePath falsy)", () =>
    Effect.gen(function*() {
      const result = yield* parseAddAttachmentParams({
        objectId: "obj-1",
        objectClass: "tracker:class:Issue",
        space: "space-1",
        filename: "test.txt",
        contentType: "text/plain",
        fileUrl: "https://example.com/file.txt"
      })

      expect(result.fileUrl).toBe("https://example.com/file.txt")
      expect(result.filePath).toBeUndefined()
      expect(result.data).toBeUndefined()
    }))

  // test-revizorro: approved
  it.effect("accepts when ONLY data is provided (filePath AND fileUrl falsy)", () =>
    Effect.gen(function*() {
      const result = yield* parseAddAttachmentParams({
        objectId: "obj-1",
        objectClass: "tracker:class:Issue",
        space: "space-1",
        filename: "test.txt",
        contentType: "text/plain",
        data: "aGVsbG8="
      })

      expect(result.data).toBe("aGVsbG8=")
      expect(result.filePath).toBeUndefined()
      expect(result.fileUrl).toBeUndefined()
    }))

  // test-revizorro: suspect | missing assertions for filePath/data undefined, incomplete validation of "ONLY fileUrl" requirement
  it.effect("accepts AddIssueAttachmentParams with ONLY fileUrl", () =>
    Effect.gen(function*() {
      const result = yield* parseAddIssueAttachmentParams({
        project: "PROJ",
        identifier: "PROJ-1",
        filename: "doc.pdf",
        contentType: "application/pdf",
        fileUrl: "https://example.com/doc.pdf"
      })

      expect(result.fileUrl).toBe("https://example.com/doc.pdf")
    }))

  // test-revizorro: approved
  it.effect("accepts AddIssueAttachmentParams with ONLY data", () =>
    Effect.gen(function*() {
      const result = yield* parseAddIssueAttachmentParams({
        project: "PROJ",
        identifier: "PROJ-1",
        filename: "img.png",
        contentType: "image/png",
        data: "iVBORw0KGgo="
      })

      expect(result.data).toBe("iVBORw0KGgo=")
    }))

  // test-revizorro: approved
  it.effect("accepts AddDocumentAttachmentParams with ONLY fileUrl", () =>
    Effect.gen(function*() {
      const result = yield* parseAddDocumentAttachmentParams({
        teamspace: "My Docs",
        document: "My Doc",
        filename: "readme.md",
        contentType: "text/markdown",
        fileUrl: "https://example.com/readme.md"
      })

      expect(result.fileUrl).toBe("https://example.com/readme.md")
    }))

  // test-revizorro: approved
  it.effect("accepts AddDocumentAttachmentParams with ONLY data", () =>
    Effect.gen(function*() {
      const result = yield* parseAddDocumentAttachmentParams({
        teamspace: "My Docs",
        document: "My Doc",
        filename: "small.txt",
        contentType: "text/plain",
        data: "c21hbGw="
      })

      expect(result.data).toBe("c21hbGw=")
    }))
})
