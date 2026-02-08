/**
 * Targeted tests for remaining coverage gaps across multiple files.
 */
import { describe, it } from "@effect/vitest"
import type { Channel as HulyChannel, DirectMessage as HulyDirectMessage } from "@hcengineering/chunter"
import type { Employee as HulyEmployee, Person, PersonSpace, SocialIdentity } from "@hcengineering/contact"
import type {
  AccountUuid as HulyAccountUuid,
  Class,
  Doc,
  PersonId,
  Ref,
  Space,
  Status,
  WorkspaceInfoWithStatus
} from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import type { Teamspace as HulyTeamspace } from "@hcengineering/document"
import type {
  DocNotifyContext as HulyDocNotifyContext,
  InboxNotification as HulyInboxNotification
} from "@hcengineering/notification"
import type {
  Component as HulyComponent,
  IssueTemplate as HulyIssueTemplate,
  Project as HulyProject
} from "@hcengineering/tracker"
import { IssuePriority } from "@hcengineering/tracker"
import { Effect, Redacted } from "effect"
import { expect } from "vitest"

import { HulyConfigService } from "../src/config/config.js"
import {
  parseAddAttachmentParams,
  parseAddDocumentAttachmentParams,
  parseAddIssueAttachmentParams
} from "../src/domain/schemas/attachments.js"
import { parseUploadFileParams } from "../src/domain/schemas/storage.js"
import { HulyClient, type HulyClientOperations } from "../src/huly/client.js"
import { chunter, contact, documentPlugin, notification, tracker } from "../src/huly/huly-plugins.js"
import { buildSocialIdToPersonNameMap, listChannels, listDirectMessages } from "../src/huly/operations/channels.js"
import { listTeamspaces } from "../src/huly/operations/documents.js"
import { getIssueTemplate } from "../src/huly/operations/issue-templates.js"
import { getNotification } from "../src/huly/operations/notifications.js"
import { listWorkspaces } from "../src/huly/operations/workspace.js"
import { WorkspaceClient } from "../src/huly/workspace-client.js"

// ============================================================
// 1. config.ts line 172 - testLayerToken with explicit timeout
// ============================================================

describe("config - testLayerToken connectionTimeout explicit (line 172)", () => {
  // test-revizorro: approved
  it.effect("uses provided connectionTimeout instead of default", () =>
    Effect.gen(function*() {
      const layer = HulyConfigService.testLayerToken({
        url: "https://test.huly.app",
        token: "tok",
        workspace: "ws",
        connectionTimeout: 5000
      })

      const config = yield* HulyConfigService.pipe(Effect.provide(layer))

      expect(config.connectionTimeout).toBe(5000)
      expect(config.auth._tag).toBe("token")
      if (config.auth._tag === "token") {
        expect(Redacted.value(config.auth.token)).toBe("tok")
      }
    }))

  // test-revizorro: approved
  it.effect("falls back to DEFAULT_TIMEOUT when omitted", () =>
    Effect.gen(function*() {
      const layer = HulyConfigService.testLayerToken({
        url: "https://test.huly.app",
        token: "tok",
        workspace: "ws"
      })

      const config = yield* HulyConfigService.pipe(Effect.provide(layer))

      expect(config.connectionTimeout).toBe(HulyConfigService.DEFAULT_TIMEOUT)
    }))
})

// ============================================================
// 2. storage.ts lines 25-26 - Schema.filter "Must provide filePath, fileUrl, or data"
// ============================================================

describe("UploadFileParamsSchema - no source validation (storage.ts lines 25-26)", () => {
  // test-revizorro: approved
  it.effect("rejects when no filePath, fileUrl, or data provided", () =>
    Effect.gen(function*() {
      const result = yield* parseUploadFileParams({
        filename: "test.txt",
        contentType: "text/plain"
      }).pipe(Effect.flip)

      expect(String(result)).toContain("Must provide filePath, fileUrl, or data")
    }))

  // test-revizorro: approved
  it.effect("accepts when filePath is provided", () =>
    Effect.gen(function*() {
      const result = yield* parseUploadFileParams({
        filename: "test.txt",
        contentType: "text/plain",
        filePath: "/tmp/test.txt"
      })

      expect(result.filePath).toBe("/tmp/test.txt")
    }))
})

// ============================================================
// 3. attachments.ts lines 144-145 - hasFileSource falsy path
// ============================================================

describe("AddAttachmentParamsSchema - hasFileSource falsy (attachments.ts lines 144-145)", () => {
  // test-revizorro: approved
  it.effect("rejects AddAttachmentParams when no file source", () =>
    Effect.gen(function*() {
      const result = yield* parseAddAttachmentParams({
        objectId: "obj-1",
        objectClass: "tracker:class:Issue",
        space: "space-1",
        filename: "test.txt",
        contentType: "text/plain"
      }).pipe(Effect.flip)

      expect(String(result)).toContain("Must provide filePath, fileUrl, or data")
    }))

  // test-revizorro: approved
  it.effect("rejects AddIssueAttachmentParams when no file source", () =>
    Effect.gen(function*() {
      const result = yield* parseAddIssueAttachmentParams({
        project: "PROJ",
        identifier: "PROJ-1",
        filename: "test.txt",
        contentType: "text/plain"
      }).pipe(Effect.flip)

      expect(String(result)).toContain("Must provide filePath, fileUrl, or data")
    }))

  // test-revizorro: approved
  it.effect("rejects AddDocumentAttachmentParams when no file source", () =>
    Effect.gen(function*() {
      const result = yield* parseAddDocumentAttachmentParams({
        teamspace: "My Docs",
        document: "My Doc",
        filename: "test.txt",
        contentType: "text/plain"
      }).pipe(Effect.flip)

      expect(String(result)).toContain("Must provide filePath, fileUrl, or data")
    }))
})

// ============================================================
// 5. channels.ts line 159 - buildSocialIdToPersonNameMap person resolved
//    channels.ts line 187 - buildAccountUuidToNameMap emp.personUuid truthy
// ============================================================

describe("buildSocialIdToPersonNameMap - person resolved (channels.ts line 159)", () => {
  const createChannelTestLayer = (config: {
    socialIdentities: Array<SocialIdentity>
    persons: Array<Person>
  }) => {
    const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown) => {
      if (_class === contact.class.SocialIdentity) {
        const q = query as { _id?: { $in?: Array<PersonId> } }
        const ids = q._id?.$in
        if (ids) {
          const filtered = config.socialIdentities.filter(si => ids.includes(si._id))
          return Effect.succeed(toFindResult(filtered as Array<Doc>))
        }
        return Effect.succeed(toFindResult(config.socialIdentities as Array<Doc>))
      }
      if (_class === contact.class.Person) {
        const q = query as { _id?: { $in?: Array<Ref<Person>> } }
        const personIds = q._id?.$in
        if (personIds) {
          const filtered = config.persons.filter(p => personIds.includes(p._id))
          return Effect.succeed(toFindResult(filtered as Array<Doc>))
        }
        return Effect.succeed(toFindResult(config.persons as Array<Doc>))
      }
      return Effect.succeed(toFindResult([]))
    }) as HulyClientOperations["findAll"]

    return HulyClient.testLayer({ findAll: findAllImpl })
  }

  // test-revizorro: approved
  it.effect("resolves person names from socialIdentity IDs", () =>
    Effect.gen(function*() {
      const client = yield* HulyClient

      const result = yield* buildSocialIdToPersonNameMap(client, ["social-alice" as PersonId])

      expect(result.size).toBe(1)
      expect(result.get("social-alice")).toBe("Alice Smith")
    }).pipe(
      Effect.provide(
        createChannelTestLayer({
          socialIdentities: [{
            _id: "social-alice" as PersonId,
            _class: contact.class.SocialIdentity,
            space: "space-1" as Ref<Space>,
            attachedTo: "person-alice" as Ref<Person>,
            attachedToClass: contact.class.Person,
            collection: "socialIds",
            type: "huly",
            value: "alice@example.com",
            key: "huly:alice@example.com",
            modifiedBy: "user-1" as Ref<Doc>,
            modifiedOn: Date.now()
          }],
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test mock: partial Person
          persons: [{
            _id: "person-alice" as Ref<Person>,
            _class: contact.class.Person,
            space: "space-1" as Ref<Space>,
            name: "Alice Smith",
            modifiedBy: "user-1" as Ref<Doc>,
            modifiedOn: Date.now(),
            createdBy: "user-1" as Ref<Doc>,
            createdOn: Date.now()
          } as Person]
        })
      )
    ))
})

describe("channels - buildAccountUuidToNameMap emp.personUuid truthy (line 187)", () => {
  // test-revizorro: approved
  it.effect("resolves member names in listDirectMessages via buildAccountUuidToNameMap", () =>
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
        messages: 5,
        modifiedBy: "user-1" as Ref<Doc>,
        modifiedOn: Date.now(),
        createdBy: "user-1" as Ref<Doc>,
        createdOn: Date.now()
      }

      // eslint-disable-next-line no-restricted-syntax -- test mock: double assertion for branded Employee type
      const emp1 = {
        _id: "emp-1" as Ref<HulyEmployee>,
        _class: contact.mixin.Employee,
        space: "space-1" as Ref<Space>,
        name: "Alice",
        personUuid: "account-1",
        modifiedBy: "user-1" as Ref<Doc>,
        modifiedOn: Date.now(),
        createdBy: "user-1" as Ref<Doc>,
        createdOn: Date.now()
      } as unknown as HulyEmployee

      // eslint-disable-next-line no-restricted-syntax -- test mock: double assertion for branded Employee type
      const emp2 = {
        _id: "emp-2" as Ref<HulyEmployee>,
        _class: contact.mixin.Employee,
        space: "space-1" as Ref<Space>,
        name: "Bob",
        personUuid: "account-2",
        modifiedBy: "user-1" as Ref<Doc>,
        modifiedOn: Date.now(),
        createdBy: "user-1" as Ref<Doc>,
        createdOn: Date.now()
      } as unknown as HulyEmployee

      const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, _query: unknown) => {
        if (_class === chunter.class.DirectMessage) {
          return Effect.succeed(toFindResult([dm] as Array<Doc>))
        }
        if (_class === contact.mixin.Employee) {
          return Effect.succeed(toFindResult([emp1, emp2] as Array<Doc>))
        }
        return Effect.succeed(toFindResult([]))
      }) as HulyClientOperations["findAll"]

      const testLayer = HulyClient.testLayer({ findAll: findAllImpl })

      const result = yield* listDirectMessages({}).pipe(Effect.provide(testLayer))

      expect(result.conversations).toHaveLength(1)
      expect(result.conversations[0].participants).toContain("Alice")
      expect(result.conversations[0].participants).toContain("Bob")
    }))
})

// ============================================================
// 6. documents.ts line 167 - ts.description truthy/falsy branches
// ============================================================

describe("listTeamspaces - description || undefined branches (documents.ts line 167)", () => {
  const createDocTestLayer = (teamspaces: Array<HulyTeamspace>) => {
    const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown) => {
      if (_class === documentPlugin.class.Teamspace) {
        const q = query as Record<string, unknown>
        let filtered = [...teamspaces]
        if (q.archived !== undefined) {
          filtered = filtered.filter(ts => ts.archived === q.archived)
        }
        return Effect.succeed(toFindResult(filtered as Array<Doc>))
      }
      return Effect.succeed(toFindResult([]))
    }) as HulyClientOperations["findAll"]

    return HulyClient.testLayer({ findAll: findAllImpl })
  }

  const makeTeamspace = (overrides?: Partial<HulyTeamspace>): HulyTeamspace => ({
    _id: "ts-1" as Ref<HulyTeamspace>,
    _class: documentPlugin.class.Teamspace,
    space: "space-1" as Ref<Space>,
    name: "Test",
    description: "",
    archived: false,
    private: false,
    modifiedBy: "user-1" as Ref<Doc>,
    modifiedOn: Date.now(),
    createdBy: "user-1" as Ref<Doc>,
    createdOn: Date.now(),
    ...overrides
  })

  // test-revizorro: approved
  it.effect("maps truthy description to its value", () =>
    Effect.gen(function*() {
      const ts = makeTeamspace({ description: "Has description" })
      const testLayer = createDocTestLayer([ts])

      const result = yield* listTeamspaces({}).pipe(Effect.provide(testLayer))

      expect(result.teamspaces[0].description).toBe("Has description")
    }))

  // test-revizorro: approved
  it.effect("maps falsy description to undefined", () =>
    Effect.gen(function*() {
      const ts = makeTeamspace({ description: "" })
      const testLayer = createDocTestLayer([ts])

      const result = yield* listTeamspaces({}).pipe(Effect.provide(testLayer))

      expect(result.teamspaces[0].description).toBeUndefined()
    }))
})

// ============================================================
// 7. issue-templates.ts line 176 - getIssueTemplate assignee person not found
//    issue-templates.ts line 187 - getIssueTemplate component not found
// ============================================================

describe("getIssueTemplate - assignee/component lookup false branches (issue-templates.ts lines 176, 187)", () => {
  const makeProject = (overrides?: Partial<HulyProject>): HulyProject => ({
    _id: "project-1" as Ref<HulyProject>,
    _class: tracker.class.Project,
    space: "space-1" as Ref<Space>,
    identifier: "TEST",
    name: "Test Project",
    sequence: 1,
    defaultIssueStatus: "status-open" as Ref<Status>,
    defaultTimeReportDay: 0,
    modifiedBy: "user-1" as Ref<Doc>,
    modifiedOn: Date.now(),
    createdBy: "user-1" as Ref<Doc>,
    createdOn: Date.now(),
    ...overrides
  })

  const makeTemplate = (overrides?: Partial<HulyIssueTemplate>): HulyIssueTemplate => ({
    _id: "template-1" as Ref<HulyIssueTemplate>,
    _class: tracker.class.IssueTemplate,
    space: "project-1" as Ref<HulyProject>,
    title: "Bug Report",
    description: "Description",
    priority: IssuePriority.Medium,
    assignee: null,
    component: null,
    estimation: 0,
    children: [],
    comments: 0,
    modifiedBy: "user-1" as Ref<Doc>,
    modifiedOn: 1000,
    createdBy: "user-1" as Ref<Doc>,
    createdOn: 900,
    ...overrides
  })

  const createIssueTemplateTestLayer = (config: {
    projects: Array<HulyProject>
    templates: Array<HulyIssueTemplate>
    persons?: Array<Person>
    components?: Array<HulyComponent>
  }) => {
    const findAllImpl: HulyClientOperations["findAll"] =
      (() => Effect.succeed(toFindResult([]))) as HulyClientOperations["findAll"]

    const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
      if (_class === tracker.class.Project) {
        const q = query as Record<string, unknown>
        const found = config.projects.find(p => p.identifier === q.identifier)
        return Effect.succeed(found as Doc | undefined)
      }
      if (_class === tracker.class.IssueTemplate) {
        const q = query as Record<string, unknown>
        const found = config.templates.find(t =>
          (q._id && t._id === q._id && (!q.space || t.space === q.space))
          || (q.title && t.title === q.title && (!q.space || t.space === q.space))
        )
        return Effect.succeed(found as Doc | undefined)
      }
      if (_class === contact.class.Person) {
        const q = query as Record<string, unknown>
        if (q._id) {
          const found = (config.persons ?? []).find(p => p._id === q._id)
          return Effect.succeed(found as Doc | undefined)
        }
        return Effect.succeed(undefined)
      }
      if (_class === tracker.class.Component) {
        const q = query as Record<string, unknown>
        if (q._id) {
          const found = (config.components ?? []).find(c => c._id === q._id)
          return Effect.succeed(found as Doc | undefined)
        }
        return Effect.succeed(undefined)
      }
      return Effect.succeed(undefined)
    }) as HulyClientOperations["findOne"]

    return HulyClient.testLayer({ findAll: findAllImpl, findOne: findOneImpl })
  }

  // test-revizorro: approved
  it.effect("returns undefined assignee when assignee ref exists but person not found in DB", () =>
    Effect.gen(function*() {
      const project = makeProject()
      const template = makeTemplate({
        assignee: "nonexistent-person" as Ref<Person>
      })
      const testLayer = createIssueTemplateTestLayer({
        projects: [project],
        templates: [template],
        persons: []
      })

      const result = yield* getIssueTemplate({
        project: "TEST",
        template: "Bug Report"
      }).pipe(Effect.provide(testLayer))

      expect(result.assignee).toBeUndefined()
    }))

  // test-revizorro: approved
  it.effect("returns undefined component when component ref exists but component not found in DB", () =>
    Effect.gen(function*() {
      const project = makeProject()
      const template = makeTemplate({
        component: "nonexistent-comp" as Ref<HulyComponent>
      })
      const testLayer = createIssueTemplateTestLayer({
        projects: [project],
        templates: [template],
        components: []
      })

      const result = yield* getIssueTemplate({
        project: "TEST",
        template: "Bug Report"
      }).pipe(Effect.provide(testLayer))

      expect(result.component).toBeUndefined()
    }))
})

// ============================================================
// 9. notifications.ts line 207 - notif.data truthy branch
// ============================================================

describe("getNotification - notif.data truthy branch (notifications.ts line 207)", () => {
  const makeNotification = (overrides?: Partial<HulyInboxNotification>): HulyInboxNotification => ({
    _id: "notif-1" as Ref<HulyInboxNotification>,
    _class: notification.class.InboxNotification,
    space: "person-space-1" as Ref<PersonSpace>,
    // eslint-disable-next-line no-restricted-syntax -- test mock: double assertion for branded user type
    user: "user-1" as unknown as HulyInboxNotification["user"],
    isViewed: false,
    archived: false,
    objectId: "obj-1" as Ref<Doc>,
    objectClass: "tracker.class.Issue" as Ref<Class<Doc>>,
    docNotifyContext: "ctx-1" as Ref<HulyDocNotifyContext>,
    title: "Test" as HulyInboxNotification["title"],
    body: "Body" as HulyInboxNotification["body"],
    data: undefined,
    createdOn: 1706500000000,
    modifiedOn: 1706500000000,
    modifiedBy: "user-1" as Ref<Doc>,
    createdBy: "user-1" as Ref<Doc>,
    ...overrides
  })

  const createNotifTestLayer = (notifications: Array<HulyInboxNotification>) => {
    const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
      if (_class === notification.class.InboxNotification) {
        const q = query as { _id?: Ref<HulyInboxNotification> }
        const found = notifications.find(n => n._id === q._id)
        return Effect.succeed(found as Doc | undefined)
      }
      return Effect.succeed(undefined)
    }) as HulyClientOperations["findOne"]

    return HulyClient.testLayer({ findOne: findOneImpl })
  }

  // test-revizorro: scheduled
  it.effect("returns data when notif.data is truthy", () =>
    Effect.gen(function*() {
      const notif = makeNotification({
        // eslint-disable-next-line no-restricted-syntax -- test mock: double assertion for branded data type
        data: { key: "value" } as unknown as HulyInboxNotification["data"]
      })
      const testLayer = createNotifTestLayer([notif])

      const result = yield* getNotification({ notificationId: "notif-1" }).pipe(Effect.provide(testLayer))

      expect(result.data).toEqual({ key: "value" })
    }))

  // test-revizorro: approved
  it.effect("returns undefined data when notif.data is falsy", () =>
    Effect.gen(function*() {
      const notif = makeNotification({ data: undefined })
      const testLayer = createNotifTestLayer([notif])

      const result = yield* getNotification({ notificationId: "notif-1" }).pipe(Effect.provide(testLayer))

      expect(result.data).toBeUndefined()
    }))
})

// ============================================================
// 10. workspace.ts line 143 - ws.region defined in listWorkspaces
// ============================================================

describe("listWorkspaces - ws.region defined branch (workspace.ts line 143)", () => {
  const mkWorkspaceInfo = (overrides?: Partial<WorkspaceInfoWithStatus>): WorkspaceInfoWithStatus => ({
    // eslint-disable-next-line no-restricted-syntax -- test mock: double assertion for branded WorkspaceInfoWithStatus uuid
    uuid: "ws-1" as unknown as WorkspaceInfoWithStatus["uuid"],
    name: "Test Workspace",
    url: "test-workspace",
    region: undefined,
    createdOn: 1700000000000,
    versionMajor: 1,
    versionMinor: 0,
    versionPatch: 0,
    mode: "active",
    processingAttemps: 0,
    allowReadOnlyGuest: false,
    allowGuestSignUp: false,
    ...overrides
  })

  // test-revizorro: approved
  it.effect("maps ws.region to RegionId when defined", () =>
    Effect.gen(function*() {
      const workspaces = [
        // eslint-disable-next-line no-restricted-syntax -- test mock: double assertion for branded uuid
        mkWorkspaceInfo({ uuid: "ws-1" as unknown as WorkspaceInfoWithStatus["uuid"], region: "eu-west" })
      ]
      const testLayer = WorkspaceClient.testLayer({
        getUserWorkspaces: () => Effect.succeed(workspaces)
      })

      const result = yield* listWorkspaces({}).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
      expect(result[0].region).toBe("eu-west")
    }))

  // test-revizorro: approved
  it.effect("maps ws.region to undefined when not defined", () =>
    Effect.gen(function*() {
      const workspaces = [
        // eslint-disable-next-line no-restricted-syntax -- test mock: double assertion for branded uuid
        mkWorkspaceInfo({ uuid: "ws-1" as unknown as WorkspaceInfoWithStatus["uuid"], region: undefined })
      ]
      const testLayer = WorkspaceClient.testLayer({
        getUserWorkspaces: () => Effect.succeed(workspaces)
      })

      const result = yield* listWorkspaces({}).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(1)
      expect(result[0].region).toBeUndefined()
    }))
})

// ============================================================
// Extra: channels.ts listChannels - includeArchived true branch
// ============================================================

describe("listChannels - includeArchived true (channels.ts line 209 true branch)", () => {
  // test-revizorro: approved
  it.effect("includes archived channels when includeArchived is true", () =>
    Effect.gen(function*() {
      const archivedChannel: HulyChannel = {
        _id: "ch-archived" as Ref<HulyChannel>,
        _class: chunter.class.Channel,
        space: "space-1" as Ref<Space>,
        name: "old-channel",
        topic: "",
        description: "",
        private: false,
        archived: true,
        members: [],
        messages: 0,
        modifiedBy: "user-1" as Ref<Doc>,
        modifiedOn: Date.now(),
        createdBy: "user-1" as Ref<Doc>,
        createdOn: Date.now()
      }

      const activeChannel: HulyChannel = {
        _id: "ch-active" as Ref<HulyChannel>,
        _class: chunter.class.Channel,
        space: "space-1" as Ref<Space>,
        name: "active-channel",
        topic: "",
        description: "",
        private: false,
        archived: false,
        members: [],
        messages: 0,
        modifiedBy: "user-1" as Ref<Doc>,
        modifiedOn: Date.now(),
        createdBy: "user-1" as Ref<Doc>,
        createdOn: Date.now()
      }

      const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown) => {
        if (_class === chunter.class.Channel) {
          const q = query as Record<string, unknown>
          let channels = [archivedChannel, activeChannel]
          if (q.archived !== undefined) {
            channels = channels.filter(c => c.archived === q.archived)
          }
          return Effect.succeed(toFindResult(channels as Array<Doc>))
        }
        return Effect.succeed(toFindResult([]))
      }) as HulyClientOperations["findAll"]

      const testLayer = HulyClient.testLayer({ findAll: findAllImpl })

      const result = yield* listChannels({ includeArchived: true }).pipe(Effect.provide(testLayer))

      expect(result).toHaveLength(2)
    }))
})
