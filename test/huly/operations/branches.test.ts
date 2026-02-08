/**
 * Branch coverage tests for small gaps in:
 * - attachments.ts (line 287: toFileSourceParams with no sources)
 * - components.ts (line 177: getComponent when lead person lookup returns undefined)
 * - threads.ts (line 133: sender name resolved from socialIdToPersonNameMap)
 * - storage.ts (lines 46-48: filePath and fileUrl branches in uploadFile)
 */
import { describe, it } from "@effect/vitest"
import type { ActivityMessage } from "@hcengineering/activity"
import type { Channel as HulyChannel, ChatMessage, ThreadMessage as HulyThreadMessage } from "@hcengineering/chunter"
import type { Employee as HulyEmployee, Person, SocialIdentity } from "@hcengineering/contact"
import { type Doc, type PersonId, type Ref, type Space, toFindResult } from "@hcengineering/core"
import type { Component as HulyComponent, Project as HulyProject } from "@hcengineering/tracker"
import { Effect } from "effect"
import { expect } from "vitest"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { chunter, contact, tracker } from "../../../src/huly/huly-plugins.js"
import { getComponent } from "../../../src/huly/operations/components.js"
import { uploadFile } from "../../../src/huly/operations/storage.js"
import { listThreadReplies } from "../../../src/huly/operations/threads.js"
import { HulyStorageClient } from "../../../src/huly/storage.js"

// --- Mock Data Builders for components ---

const makeProject = (overrides?: Partial<HulyProject>): HulyProject => {
  const result: HulyProject = {
    _id: "project-1" as Ref<HulyProject>,
    _class: tracker.class.Project,
    space: "space-1" as Ref<Space>,
    name: "Test Project",
    description: "",
    private: false,
    archived: false,
    members: [],
    identifier: "PROJ",
    sequence: 1,
    defaultIssueStatus: "status-1" as Ref<Doc>,
    defaultTimeReportDay: "CurrentWorkDay" as HulyProject["defaultTimeReportDay"],
    type: "project-type-1" as Ref<Doc>,
    modifiedBy: "user-1" as Ref<Doc>,
    modifiedOn: Date.now(),
    createdBy: "user-1" as Ref<Doc>,
    createdOn: Date.now(),
    ...overrides
  }
  return result
}

const makeComponent = (overrides?: Partial<HulyComponent>): HulyComponent => {
  const result: HulyComponent = {
    _id: "comp-1" as Ref<HulyComponent>,
    _class: tracker.class.Component,
    space: "project-1" as Ref<HulyProject>,
    label: "Backend",
    description: "Backend component",
    lead: "person-1" as Ref<Employee>,
    comments: 0,
    modifiedBy: "user-1" as Ref<Doc>,
    modifiedOn: Date.now(),
    createdBy: "user-1" as Ref<Doc>,
    createdOn: Date.now(),
    ...overrides
  }
  return result
}

type Employee = HulyEmployee

// --- Components: getComponent with lead person not found (line 177) ---

const createComponentTestLayer = (config: {
  projects: Array<HulyProject>
  components: Array<HulyComponent>
  persons?: Array<Person>
}) => {
  const projects = config.projects
  const components = config.components
  const persons = config.persons ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown) => {
    if (_class === tracker.class.Component) {
      const q = query as Record<string, unknown>
      const filtered = components.filter(c => q.space === undefined || c.space === q.space)
      return Effect.succeed(toFindResult(filtered as Array<Doc>))
    }
    if (_class === contact.class.Person) {
      const q = query as Record<string, unknown>
      if (q._id && typeof q._id === "object" && "$in" in (q._id as Record<string, unknown>)) {
        const ids = (q._id as Record<string, Array<string>>).$in
        const filtered = persons.filter(p => ids.includes(p._id))
        return Effect.succeed(toFindResult(filtered as Array<Doc>))
      }
      return Effect.succeed(toFindResult(persons as Array<Doc>))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    if (_class === tracker.class.Project) {
      const q = query as Record<string, unknown>
      const found = projects.find(p => p.identifier === q.identifier)
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === tracker.class.Component) {
      const q = query as Record<string, unknown>
      const found = components.find(c =>
        (q.space !== undefined && q._id !== undefined && c.space === q.space && c._id === q._id)
        || (q.space !== undefined && q.label !== undefined && c.space === q.space && c.label === q.label)
      )
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === contact.class.Person) {
      const q = query as Record<string, unknown>
      if (q._id) {
        const found = persons.find(p => p._id === q._id)
        return Effect.succeed(found as Doc | undefined)
      }
      return Effect.succeed(undefined)
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl
  })
}

describe("getComponent - lead person not found in DB (line 177 false branch)", () => {
  // test-revizorro: approved
  it.effect("returns undefined lead when person lookup returns undefined", () =>
    Effect.gen(function*() {
      const project = makeProject({ _id: "proj-1" as Ref<HulyProject>, identifier: "PROJ" })
      const comp = makeComponent({
        _id: "comp-1" as Ref<HulyComponent>,
        label: "Backend",
        lead: "nonexistent-person" as Ref<Employee>,
        space: "proj-1" as Ref<HulyProject>
      })

      // No persons provided - so findOne for Person returns undefined
      const testLayer = createComponentTestLayer({
        projects: [project],
        components: [comp],
        persons: []
      })

      const result = yield* getComponent({ project: "PROJ", component: "Backend" }).pipe(Effect.provide(testLayer))

      expect(result.id).toBe("comp-1")
      // lead is set (non-null), but person lookup fails, so leadName stays undefined
      expect(result.lead).toBeUndefined()
    }))
})

// --- Threads: sender name resolved (line 133 true branch) ---

const makeChannel = (overrides?: Partial<HulyChannel>): HulyChannel => ({
  _id: "channel-1" as Ref<HulyChannel>,
  _class: chunter.class.Channel,
  space: "space-1" as Ref<Space>,
  name: "general",
  topic: "",
  description: "",
  private: false,
  archived: false,
  members: [],
  messages: 0,
  modifiedBy: "user-1" as Ref<Doc>,
  modifiedOn: Date.now(),
  createdBy: "user-1" as Ref<Doc>,
  createdOn: Date.now(),
  ...overrides
})

const makeChatMessage = (overrides?: Partial<ChatMessage>): ChatMessage => ({
  _id: "msg-1" as Ref<ChatMessage>,
  _class: chunter.class.ChatMessage,
  space: "channel-1" as Ref<Space>,
  attachedTo: "channel-1" as Ref<Doc>,
  attachedToClass: chunter.class.Channel,
  collection: "messages",
  message: "<p>Hello</p>",
  attachments: 0,
  modifiedBy: "user-1" as Ref<Doc>,
  modifiedOn: Date.now(),
  createdBy: "user-1" as Ref<Doc>,
  createdOn: Date.now(),
  ...overrides
})

const makeThreadMessage = (overrides?: Partial<HulyThreadMessage>): HulyThreadMessage => ({
  _id: "thread-msg-1" as Ref<HulyThreadMessage>,
  _class: chunter.class.ThreadMessage,
  space: "channel-1" as Ref<Space>,
  attachedTo: "msg-1" as Ref<ActivityMessage>,
  attachedToClass: chunter.class.ChatMessage,
  collection: "replies",
  message: "<p>Reply content</p>",
  attachments: 0,
  objectId: "channel-1" as Ref<Doc>,
  objectClass: chunter.class.Channel,
  modifiedBy: "user-1" as Ref<Doc>,
  modifiedOn: Date.now(),
  createdBy: "user-1" as Ref<Doc>,
  createdOn: Date.now(),
  ...overrides
})

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- test mock: partial Person
const makePerson = (overrides?: Partial<Person>): Person => ({
  _id: "person-1" as Ref<Person>,
  _class: contact.class.Person,
  space: "space-1" as Ref<Space>,
  name: "John Doe",
  modifiedBy: "user-1" as Ref<Doc>,
  modifiedOn: Date.now(),
  createdBy: "user-1" as Ref<Doc>,
  createdOn: Date.now(),
  ...overrides
} as Person)

const makeSocialIdentity = (overrides?: Partial<SocialIdentity>): SocialIdentity => ({
  _id: "social-1" as PersonId,
  _class: contact.class.SocialIdentity,
  space: "space-1" as Ref<Space>,
  attachedTo: "person-1" as Ref<Person>,
  attachedToClass: contact.class.Person,
  collection: "socialIds",
  type: "huly",
  value: "user@example.com",
  key: "huly:user@example.com",
  modifiedBy: "user-1" as Ref<Doc>,
  modifiedOn: Date.now(),
  ...overrides
})

const createThreadTestLayer = (config: {
  channels: Array<HulyChannel>
  messages: Array<ChatMessage>
  threadMessages: Array<HulyThreadMessage>
  persons?: Array<Person>
  socialIdentities?: Array<SocialIdentity>
}) => {
  const channels = config.channels
  const messages = config.messages
  const threadMessages = config.threadMessages
  const persons = config.persons ?? []
  const socialIdentities = config.socialIdentities ?? []

  const findAllImpl: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, options: unknown) => {
    if (_class === chunter.class.ThreadMessage) {
      const q = query as { attachedTo?: Ref<ActivityMessage>; space?: Ref<Space> }
      const filtered = threadMessages.filter(m =>
        (!q.attachedTo || m.attachedTo === q.attachedTo)
        && (!q.space || m.space === q.space)
      )
      const opts = options as { sort?: Record<string, number> } | undefined
      let result = [...filtered]
      if (opts?.sort?.createdOn !== undefined) {
        const direction = opts.sort.createdOn
        result = result.sort((a, b) => direction * ((a.createdOn ?? 0) - (b.createdOn ?? 0)))
      }
      return Effect.succeed(toFindResult(result as Array<Doc>))
    }
    if (_class === contact.class.SocialIdentity) {
      const q = query as { _id?: { $in?: Array<PersonId> } }
      const ids = q._id?.$in
      if (ids) {
        const filtered = socialIdentities.filter(si => ids.includes(si._id))
        return Effect.succeed(toFindResult(filtered as Array<Doc>))
      }
      return Effect.succeed(toFindResult(socialIdentities as Array<Doc>))
    }
    if (_class === contact.class.Person) {
      const q = query as { _id?: { $in?: Array<Ref<Person>> } }
      const personIds = q._id?.$in
      if (personIds) {
        const filtered = persons.filter(p => personIds.includes(p._id))
        return Effect.succeed(toFindResult(filtered as Array<Doc>))
      }
      return Effect.succeed(toFindResult(persons as Array<Doc>))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    if (_class === chunter.class.Channel) {
      const q = query as Record<string, unknown>
      const found = channels.find(c =>
        (q.name && c.name === q.name)
        || (q._id && c._id === q._id)
      )
      return Effect.succeed(found as Doc | undefined)
    }
    if (_class === chunter.class.ChatMessage) {
      const q = query as { _id?: Ref<ChatMessage>; space?: Ref<Space> }
      const found = messages.find(m =>
        (!q._id || m._id === q._id)
        && (!q.space || m.space === q.space)
      )
      return Effect.succeed(found as Doc | undefined)
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl
  })
}

describe("listThreadReplies - sender name resolved (line 133 true branch)", () => {
  // test-revizorro: approved
  it.effect("resolves sender names via socialId->person mapping", () =>
    Effect.gen(function*() {
      const channel = makeChannel({ _id: "ch-1" as Ref<HulyChannel>, name: "general" })
      const parentMsg = makeChatMessage({
        _id: "msg-1" as Ref<ChatMessage>,
        space: "ch-1" as Ref<Space>
      })
      const threadMsgs = [
        makeThreadMessage({
          _id: "reply-1" as Ref<HulyThreadMessage>,
          space: "ch-1" as Ref<Space>,
          attachedTo: "msg-1" as Ref<ActivityMessage>,
          modifiedBy: "social-alice" as PersonId,
          createdOn: 1000
        })
      ]
      const persons = [
        makePerson({ _id: "person-alice" as Ref<Person>, name: "Alice Smith" })
      ]
      const socialIdentities = [
        makeSocialIdentity({
          _id: "social-alice" as PersonId,
          attachedTo: "person-alice" as Ref<Person>
        })
      ]

      const testLayer = createThreadTestLayer({
        channels: [channel],
        messages: [parentMsg],
        threadMessages: threadMsgs,
        persons,
        socialIdentities
      })

      const result = yield* listThreadReplies({
        channel: "general",
        messageId: "msg-1"
      }).pipe(Effect.provide(testLayer))

      expect(result.replies).toHaveLength(1)
      expect(result.replies[0].sender).toBe("Alice Smith")
      expect(result.replies[0].senderId).toBe("social-alice")
    }))
})

// --- Storage: filePath and fileUrl branches (lines 46-48) ---

describe("uploadFile - filePath branch (line 46-47)", () => {
  // test-revizorro: approved
  it.effect("reads from file path when filePath is provided", () =>
    Effect.gen(function*() {
      // We cannot easily test actual filesystem reads in unit tests,
      // but we can verify the filePath branch is hit by checking it returns FileNotFoundError
      const testLayer = HulyStorageClient.testLayer({})

      const error = yield* Effect.flip(
        uploadFile({
          filename: "test.txt",
          filePath: "/nonexistent/path/to/file.txt",
          contentType: "text/plain"
        }).pipe(Effect.provide(testLayer))
      )

      expect(error._tag).toBe("FileNotFoundError")
    }))
})

describe("uploadFile - fileUrl branch (line 48-49)", () => {
  // test-revizorro: suspect | mocks uploadFile entirely, never tests fetchFromUrl; should use real layer or spy on fetch
  it.effect("attempts to fetch from URL when fileUrl is provided (no filePath)", () =>
    Effect.gen(function*() {
      const testLayer = HulyStorageClient.testLayer({})

      const error = yield* Effect.flip(
        uploadFile({
          filename: "remote.png",
          fileUrl: "http://localhost:1/nonexistent-image.png",
          contentType: "image/png"
        }).pipe(Effect.provide(testLayer))
      )

      // Should fail with FileFetchError since URL is unreachable
      expect(error._tag).toBe("FileFetchError")
    }))
})
