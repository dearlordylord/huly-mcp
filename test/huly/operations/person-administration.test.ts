import { describe, it } from "@effect/vitest"
import type { Channel, Employee, Person, SocialIdentity, SocialIdentityProvider, Status } from "@hcengineering/contact"
import { AvatarType } from "@hcengineering/contact"
import type { Attachment as HulyAttachment } from "@hcengineering/attachment"
import type { ChatMessage } from "@hcengineering/chunter"
import type { Blob, Class, Doc, DocumentUpdate, Ref, Space } from "@hcengineering/core"
import { AccountRole, SocialIdType } from "@hcengineering/core"
import { Effect, Exit, Layer } from "effect"
import { expect } from "vitest"

import {
  parseAddPersonAttachmentParams,
  parseAddPersonCommentParams,
  parseDeletePersonAttachmentParams,
  parseDeletePersonCommentParams,
  parseGetPersonAdministrationParams,
  parseGetPersonAttachmentParams,
  parseListPersonAttachmentsParams,
  parseListPersonCommentsParams,
  parseUpdatePersonAttachmentParams,
  parseUpdatePersonCommentParams
} from "../../../src/domain/schemas/person-administration.js"
import { Email, PersonId, PersonName } from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { PersonIdentifierAmbiguousError, PersonIdentityRepairUnsupportedError } from "../../../src/huly/errors.js"
import { attachment, chunter, contact } from "../../../src/huly/huly-plugins.js"
import {
  getPersonAdministration,
  listSocialIdentityProviders,
  repairPersonSocialIdentities
} from "../../../src/huly/operations/person-administration.js"
import { makePersonAdministrationProjection } from "../../../src/huly/operations/person-administration-projection.js"
import {
  addPersonAttachment,
  deletePersonAttachment,
  getPersonAttachment,
  listPersonAttachments,
  updatePersonAttachment
} from "../../../src/huly/operations/person-attachments.js"
import {
  addPersonComment,
  deletePersonComment,
  listPersonComments,
  updatePersonComment
} from "../../../src/huly/operations/person-comments.js"
import { markdownToMarkupString, testMarkupUrlConfig } from "../../../src/huly/operations/markup.js"
import { toAccountUuid, toRef, toSocialIdentityRef } from "../../../src/huly/operations/sdk-boundary.js"
import { HulyStorageClient } from "../../../src/huly/storage.js"
import { WorkspaceClient } from "../../../src/huly/workspace-client.js"
import { corePersonId, findResult } from "../../helpers/huly-sdk.js"

const PERSON_ID = toRef<Person>("person-1")
const PERSON_UUID = toAccountUuid("00000000-0000-4000-8000-000000000249")

const person = (overrides?: Partial<Person>): Person => ({
  _id: PERSON_ID,
  _class: contact.class.Person,
  space: contact.space.Contacts,
  name: "Lovelace,Ada",
  city: "London",
  avatarType: AvatarType.EXTERNAL,
  avatarProps: { color: "blue", url: "https://example.test/avatar.png" },
  birthday: 1_815_321_600_000,
  personUuid: PERSON_UUID,
  modifiedBy: corePersonId("actor"),
  modifiedOn: 10,
  ...overrides
})

const socialIdentity = (overrides?: Partial<SocialIdentity>): SocialIdentity => ({
  _id: toSocialIdentityRef("social-1"),
  _class: contact.class.SocialIdentity,
  space: contact.space.Contacts,
  attachedTo: PERSON_ID,
  attachedToClass: contact.class.Person,
  collection: "socialIds",
  type: SocialIdType.EMAIL,
  value: "ada@example.test",
  key: "email:ada@example.test",
  verifiedOn: 10,
  isDeleted: false,
  modifiedBy: corePersonId("actor"),
  modifiedOn: 10,
  ...overrides
})

const unverifiedSocialIdentity = (overrides?: Partial<SocialIdentity>): SocialIdentity => {
  const { verifiedOn, ...unverified } = socialIdentity(overrides)
  void verifiedOn
  return unverified
}

const personWithoutUuid = (): Person => {
  const { personUuid, ...withoutUuid } = person()
  void personUuid
  return withoutUuid
}

const sparsePerson = (): Person => {
  const { avatarProps, birthday, personUuid, ...sparse } = person()
  void avatarProps
  void birthday
  void personUuid
  return sparse
}

const message = (): ChatMessage => ({
  _id: toRef<ChatMessage>("comment-1"),
  _class: chunter.class.ChatMessage,
  space: contact.space.Contacts,
  attachedTo: PERSON_ID,
  attachedToClass: contact.class.Person,
  collection: "comments",
  message: markdownToMarkupString("Existing note", testMarkupUrlConfig),
  isPinned: false,
  replies: 0,
  reactions: 0,
  modifiedBy: corePersonId("actor"),
  modifiedOn: 10,
  createdOn: 10
})

const personAttachment = (): HulyAttachment => ({
  _id: toRef<HulyAttachment>("attachment-1"),
  _class: attachment.class.Attachment,
  space: contact.space.Contacts,
  attachedTo: PERSON_ID,
  attachedToClass: contact.class.Person,
  collection: "attachments",
  name: "note.txt",
  file: toRef<Blob>("blob-1"),
  type: "text/plain",
  size: 5,
  lastModified: 10,
  pinned: false,
  modifiedBy: corePersonId("actor"),
  modifiedOn: 10,
  createdOn: 10
})

interface Fixture {
  readonly persons?: ReadonlyArray<Person>
  readonly identities?: ReadonlyArray<SocialIdentity>
  readonly providers?: ReadonlyArray<SocialIdentityProvider>
  readonly statuses?: ReadonlyArray<Status>
  readonly channels?: ReadonlyArray<Channel>
  readonly employee?: Employee
  readonly messages?: ReadonlyArray<ChatMessage>
  readonly attachments?: ReadonlyArray<HulyAttachment>
  readonly added?: Array<string>
  readonly addedData?: Array<unknown>
  readonly updated?: Array<string>
  readonly removed?: Array<string>
}

const queryField = (query: unknown, field: string): unknown =>
  typeof query === "object" && query !== null ? Reflect.get(query, field) : undefined

const matchesQueryValue = (actual: unknown, expected: unknown): boolean => {
  if (expected === undefined) return true
  if (typeof expected === "object" && expected !== null) {
    const values = Reflect.get(expected, "$in")
    return Array.isArray(values) && values.includes(actual)
  }
  return actual === expected
}

const filterByQuery = <T extends Doc>(docs: ReadonlyArray<T>, query: unknown): Array<T> =>
  docs.filter((doc) => {
    const id = queryField(query, "_id")
    const attachedTo = queryField(query, "attachedTo")
    const name = queryField(query, "name")
    const user = queryField(query, "user")
    return (
      matchesQueryValue(doc._id, id) &&
      matchesQueryValue(queryField(doc, "attachedTo"), attachedTo) &&
      matchesQueryValue(queryField(doc, "name"), name) &&
      matchesQueryValue(queryField(doc, "user"), user)
    )
  })

const testClient = (fixture: Fixture): Layer.Layer<HulyClient> => {
  const findAll = (<T extends Doc>(_class: Ref<Class<T>>, query: unknown) => {
    const docs: ReadonlyArray<Doc> =
      _class === contact.class.Person
        ? (fixture.persons ?? [person()])
        : _class === contact.class.SocialIdentity
          ? (fixture.identities ?? [])
          : _class === contact.class.SocialIdentityProvider
            ? (fixture.providers ?? [])
            : _class === contact.class.Status
              ? (fixture.statuses ?? [])
              : _class === contact.class.Channel
                ? (fixture.channels ?? [])
                : _class === chunter.class.ChatMessage
                  ? (fixture.messages ?? [])
                  : _class === attachment.class.Attachment
                    ? (fixture.attachments ?? [])
                    : []
    return Effect.succeed(findResult(filterByQuery(docs, query)))
    // The generic SDK boundary returns T selected by _class; this in-memory fixture dispatches the same way.
  }) as HulyClientOperations["findAll"]
  const findOne = (<T extends Doc>(_class: Ref<Class<T>>, query: unknown) => {
    const docs: ReadonlyArray<Doc> =
      _class === contact.class.Person
        ? (fixture.persons ?? [person()])
        : _class === contact.class.SocialIdentity
          ? (fixture.identities ?? [])
          : _class === chunter.class.ChatMessage
            ? (fixture.messages ?? [])
            : _class === attachment.class.Attachment
              ? (fixture.attachments ?? [])
              : _class === contact.mixin.Employee && fixture.employee !== undefined
                ? [fixture.employee]
                : []
    return Effect.succeed(filterByQuery(docs, query)[0])
    // The generic SDK boundary returns T selected by _class; this fixture uses the matching collection above.
  }) as HulyClientOperations["findOne"]
  return HulyClient.testLayer({
    findAll,
    findAllInModel: findAll,
    findOne,
    addCollection: (_class, _space, _attachedTo, _attachedToClass, _collection, _data, id) => {
      fixture.added?.push(String(id))
      fixture.addedData?.push(_data)
      return Effect.succeed(id ?? toRef("generated"))
    },
    updateDoc: <T extends Doc>(
      _class: Ref<Class<T>>,
      _space: Ref<Space>,
      id: Ref<T>,
      _operations: DocumentUpdate<T>
    ) => {
      fixture.updated?.push(String(id))
      return Effect.succeed({})
    },
    removeDoc: <T extends Doc>(_class: Ref<Class<T>>, _space: Ref<Space>, id: Ref<T>) => {
      fixture.removed?.push(String(id))
      return Effect.succeed({})
    }
  })
}

const workspace = WorkspaceClient.testLayer({
  getWorkspaceMembers: () => Effect.succeed([{ person: PERSON_UUID, role: AccountRole.User }]),
  getUserProfile: () =>
    Effect.succeed({ uuid: PERSON_UUID, firstName: "Ada", lastName: "Lovelace", bio: "Mathematician", isPublic: true }),
  getPersonInfo: () =>
    Effect.succeed({
      uuid: PERSON_UUID,
      name: "Lovelace,Ada",
      socialIds: [
        {
          _id: corePersonId("social-1"),
          type: SocialIdType.EMAIL,
          value: "ada@example.test",
          key: "email:ada@example.test",
          verifiedOn: 10
        },
        { _id: corePersonId("social-2"), type: SocialIdType.GITHUB, value: "ada", key: "github:ada" }
      ]
    })
})

describe("person administration schemas", () => {
  it.effect("accepts exactly one person locator modality", () =>
    Effect.gen(function* () {
      expect(yield* parseGetPersonAdministrationParams({ person: { email: "ada@example.test" } })).toEqual({
        person: { email: "ada@example.test" }
      })
      expect(
        Exit.isFailure(yield* Effect.exit(parseGetPersonAdministrationParams({ person: { id: "a", name: "b" } })))
      ).toBe(true)
    })
  )

  it.effect("requires an attachment upload source", () =>
    Effect.gen(function* () {
      const result = yield* Effect.exit(
        parseAddPersonAttachmentParams({ person: { id: "person-1" }, filename: "a.txt", contentType: "text/plain" })
      )
      expect(Exit.isFailure(result)).toBe(true)
    })
  )

  it.effect("rejects multiple attachment upload sources", () =>
    Effect.gen(function* () {
      const result = yield* Effect.exit(
        parseAddPersonAttachmentParams({
          person: { id: "person-1" },
          filename: "a.txt",
          contentType: "text/plain",
          data: "aGVsbG8=",
          fileUrl: "https://example.test/a.txt"
        })
      )
      expect(Exit.isFailure(result)).toBe(true)
    })
  )

  it.effect("requires at least one attachment update", () =>
    Effect.gen(function* () {
      const result = yield* Effect.exit(
        parseUpdatePersonAttachmentParams({ person: { id: "person-1" }, attachmentId: "attachment-1" })
      )
      expect(Exit.isFailure(result)).toBe(true)
    })
  )
})

describe("person identity and profile administration", () => {
  it("projects sparse and nullable native profile fields without inventing values", () => {
    const sparseIdentity = unverifiedSocialIdentity({
      _id: toSocialIdentityRef("social-2"),
      displayValue: "Ada",
      isDeleted: true,
      type: SocialIdType.GITHUB,
      value: "ada",
      key: "github:ada"
    })
    const emptyChannel: Channel = {
      _id: toRef<Channel>("channel-2"),
      _class: contact.class.Channel,
      space: contact.space.Contacts,
      attachedTo: PERSON_ID,
      attachedToClass: contact.class.Person,
      collection: "channels",
      provider: contact.channelProvider.Email,
      value: "ada@example.test",
      modifiedBy: corePersonId("actor"),
      modifiedOn: 10
    }
    const projection = makePersonAdministrationProjection({
      person: sparsePerson(),
      identities: [sparseIdentity, socialIdentity()],
      statuses: [],
      channels: [emptyChannel],
      employee: undefined,
      members: [],
      profile: {
        uuid: PERSON_UUID,
        firstName: "Ada",
        lastName: "Lovelace",
        isPublic: false,
        city: null,
        country: null,
        website: null,
        bio: null,
        socialLinks: null
      }
    })
    expect(projection).toMatchObject({
      personId: "person-1",
      avatar: { type: AvatarType.EXTERNAL },
      workspaceMember: { member: false },
      socialIdentities: [
        { id: "social-1", isDeleted: false },
        { id: "social-2", displayValue: "Ada", isDeleted: true }
      ],
      channelActivity: [{ channelId: "channel-2" }],
      profile: {}
    })
  })

  it("projects all optional profile and channel values and deterministic sort tie-breakers", () => {
    const firstChannel: Channel = {
      _id: toRef<Channel>("channel-b"),
      _class: contact.class.Channel,
      space: contact.space.Contacts,
      attachedTo: PERSON_ID,
      attachedToClass: contact.class.Person,
      collection: "channels",
      provider: contact.channelProvider.Email,
      value: "b@example.test",
      items: 2,
      lastMessage: 20,
      modifiedBy: corePersonId("actor"),
      modifiedOn: 10
    }
    const secondChannel: Channel = { ...firstChannel, _id: toRef<Channel>("channel-a"), value: "a@example.test" }
    const projection = makePersonAdministrationProjection({
      person: person({ avatar: toRef<Blob>("avatar-1"), profile: toRef("profile-1"), birthday: null }),
      identities: [
        socialIdentity({ _id: toSocialIdentityRef("social-b"), key: "email:b@example.test" }),
        socialIdentity({ _id: toSocialIdentityRef("social-a"), key: "email:a@example.test" })
      ],
      statuses: [
        {
          _id: toRef<Status>("status-b"),
          _class: contact.class.Status,
          space: contact.space.Contacts,
          attachedTo: toRef<Employee>(PERSON_ID),
          attachedToClass: contact.mixin.Employee,
          collection: "statuses",
          name: "B",
          dueDate: 10,
          modifiedBy: corePersonId("actor"),
          modifiedOn: 10
        },
        {
          _id: toRef<Status>("status-a"),
          _class: contact.class.Status,
          space: contact.space.Contacts,
          attachedTo: toRef<Employee>(PERSON_ID),
          attachedToClass: contact.mixin.Employee,
          collection: "statuses",
          name: "A",
          dueDate: 10,
          modifiedBy: corePersonId("actor"),
          modifiedOn: 10
        }
      ],
      channels: [firstChannel, secondChannel],
      employee: undefined,
      members: [{ person: PERSON_UUID, role: AccountRole.User }],
      profile: {
        uuid: PERSON_UUID,
        firstName: "Ada",
        lastName: "Lovelace",
        isPublic: false,
        city: "London",
        country: "UK",
        website: "https://example.test",
        bio: "Mathematician",
        socialLinks: { github: "ada" }
      }
    })
    expect(projection).toMatchObject({
      birthday: null,
      avatar: { blobId: "avatar-1", color: "blue", externalUrl: "https://example.test/avatar.png" },
      profileCardId: "profile-1",
      contactStatuses: [{ name: "A" }, { name: "B" }],
      workspaceMember: { member: true, role: "USER" },
      channelActivity: [
        { channelId: "channel-a", items: 2, lastMessage: 20 },
        { channelId: "channel-b", items: 2, lastMessage: 20 }
      ],
      profile: { city: "London", country: "UK", website: "https://example.test", socialLinks: { github: "ada" } }
    })
  })

  it.effect("exposes all stable person projections", () => {
    const identities = [socialIdentity()]
    const status: Status = {
      _id: toRef<Status>("status-1"),
      _class: contact.class.Status,
      space: contact.space.Contacts,
      attachedTo: toRef<Employee>(PERSON_ID),
      attachedToClass: contact.mixin.Employee,
      collection: "statuses",
      name: "On leave",
      dueDate: 1_815_408_000_000,
      modifiedBy: corePersonId("actor"),
      modifiedOn: 10
    }
    return Effect.gen(function* () {
      const result = yield* getPersonAdministration({ person: { id: PersonId.make("person-1") } })
      expect(result.socialIdentities).toHaveLength(1)
      expect(result.workspaceMember).toEqual({ member: true, role: "USER" })
      expect(result.contactStatuses[0]?.name).toBe("On leave")
      expect(result.profile?.bio).toBe("Mathematician")
      expect(result.avatar.externalUrl).toBe("https://example.test/avatar.png")
      expect(result.fieldClassifications.some((entry) => entry.classification === "unsupported")).toBe(true)
    }).pipe(Effect.provide(Layer.merge(testClient({ identities, statuses: [status] }), workspace)))
  })

  it.effect("lists installed native providers", () => {
    const provider: SocialIdentityProvider = {
      _id: contact.socialIdentityProvider.Email,
      _class: contact.class.SocialIdentityProvider,
      space: contact.space.Contacts,
      type: SocialIdType.EMAIL,
      label: contact.string.Email,
      modifiedBy: corePersonId("actor"),
      modifiedOn: 10
    }
    return Effect.gen(function* () {
      expect(yield* listSocialIdentityProviders()).toEqual([
        { id: contact.socialIdentityProvider.Email, type: "email" }
      ])
    }).pipe(Effect.provide(testClient({ providers: [provider] })))
  })

  it.effect("sorts providers deterministically by type and then native ID", () => {
    const base: SocialIdentityProvider = {
      _id: contact.socialIdentityProvider.Email,
      _class: contact.class.SocialIdentityProvider,
      space: contact.space.Contacts,
      type: SocialIdType.EMAIL,
      label: contact.string.Email,
      modifiedBy: corePersonId("actor"),
      modifiedOn: 10
    }
    const providers = [
      base,
      { ...base, _id: contact.socialIdentityProvider.Huly, type: SocialIdType.HULY },
      { ...base, _id: contact.socialIdentityProvider.GitHub }
    ]
    return Effect.gen(function* () {
      expect((yield* listSocialIdentityProviders()).map((provider) => provider.id)).toEqual([
        contact.socialIdentityProvider.Email,
        contact.socialIdentityProvider.GitHub,
        contact.socialIdentityProvider.Huly
      ])
    }).pipe(Effect.provide(testClient({ providers })))
  })

  it.effect("resolves email and name locators and reports a missing exact ID", () =>
    Effect.gen(function* () {
      expect((yield* getPersonAdministration({ person: { email: Email.make("ada@example.test") } })).personId).toBe(
        "person-1"
      )
      expect((yield* getPersonAdministration({ person: { name: PersonName.make("Lovelace,Ada") } })).personId).toBe(
        "person-1"
      )
      expect(
        Exit.isFailure(yield* Effect.exit(getPersonAdministration({ person: { id: PersonId.make("missing-person") } })))
      ).toBe(true)
      expect(
        Exit.isFailure(
          yield* Effect.exit(getPersonAdministration({ person: { name: PersonName.make("Missing,Person") } }))
        )
      ).toBe(true)
    }).pipe(Effect.provide(Layer.merge(testClient({ identities: [socialIdentity()] }), workspace)))
  )

  it.effect("reports a missing exact email", () =>
    Effect.gen(function* () {
      expect(
        Exit.isFailure(
          yield* Effect.exit(getPersonAdministration({ person: { email: Email.make("missing@example.test") } }))
        )
      ).toBe(true)
    }).pipe(Effect.provide(Layer.merge(testClient({ identities: [] }), workspace)))
  )

  it.effect("omits account profile data for a contact without an account link", () =>
    Effect.gen(function* () {
      const result = yield* getPersonAdministration({ person: { id: PersonId.make("person-1") } })
      expect(result.profile).toBeUndefined()
      expect(result.workspaceMember).toEqual({ member: false })
    }).pipe(Effect.provide(Layer.merge(testClient({ persons: [personWithoutUuid()] }), workspace)))
  )

  it.effect("creates only missing account-authoritative identities and is idempotent for existing ones", () => {
    const added: Array<string> = []
    return Effect.gen(function* () {
      const result = yield* repairPersonSocialIdentities({ person: { id: PersonId.make("person-1") } })
      expect(result).toMatchObject({ created: 1, unchanged: 1, unsupported: [] })
      expect(added).toEqual(["social-2"])
    }).pipe(Effect.provide(Layer.merge(testClient({ identities: [socialIdentity()], added }), workspace)))
  })

  it.effect("creates complete authoritative projections and promotes native verification", () => {
    const addedData: Array<unknown> = []
    const updated: Array<string> = []
    const authoritativeWorkspace = WorkspaceClient.testLayer({
      getPersonInfo: () =>
        Effect.succeed({
          uuid: PERSON_UUID,
          name: "Lovelace,Ada",
          socialIds: [
            {
              _id: corePersonId("social-1"),
              type: SocialIdType.EMAIL,
              value: "ada@example.test",
              key: "email:ada@example.test",
              verifiedOn: 20
            },
            {
              _id: corePersonId("social-2"),
              type: SocialIdType.GITHUB,
              value: "ada",
              key: "github:ada",
              displayValue: "Ada Lovelace",
              verifiedOn: 20
            }
          ]
        })
    })
    return Effect.gen(function* () {
      const result = yield* repairPersonSocialIdentities({ person: { id: PersonId.make("person-1") } })
      expect(result).toMatchObject({ created: 1, updated: 1 })
      expect(updated).toEqual(["social-1"])
      expect(addedData[0]).toMatchObject({ displayValue: "Ada Lovelace", verifiedOn: 20 })
    }).pipe(
      Effect.provide(
        Layer.merge(
          testClient({ identities: [unverifiedSocialIdentity()], addedData, updated }),
          authoritativeWorkspace
        )
      )
    )
  })

  it.effect("ignores an already-deleted authoritative identity that has no workspace projection", () => {
    const deletedOnlyWorkspace = WorkspaceClient.testLayer({
      getPersonInfo: () =>
        Effect.succeed({
          uuid: PERSON_UUID,
          name: "Lovelace,Ada",
          socialIds: [
            {
              _id: corePersonId("social-deleted"),
              type: SocialIdType.EMAIL,
              value: "old@example.test",
              key: "email:old@example.test",
              isDeleted: true
            }
          ]
        })
    })
    return Effect.gen(function* () {
      expect(yield* repairPersonSocialIdentities({ person: { id: PersonId.make("person-1") } })).toMatchObject({
        created: 0,
        updated: 0,
        unchanged: 1
      })
    }).pipe(Effect.provide(Layer.merge(testClient({}), deletedOnlyWorkspace)))
  })

  it.effect("reports workspace-only identities when the account has no authoritative identities", () => {
    const emptyWorkspace = WorkspaceClient.testLayer({
      getPersonInfo: () => Effect.succeed({ uuid: PERSON_UUID, name: "Lovelace,Ada", socialIds: [] })
    })
    return Effect.gen(function* () {
      const result = yield* repairPersonSocialIdentities({ person: { id: PersonId.make("person-1") } })
      expect(result.unsupported[0]?.reason).toContain("absent from the authoritative account record")
    }).pipe(Effect.provide(Layer.merge(testClient({ identities: [socialIdentity()] }), emptyWorkspace)))
  })

  it.effect("reports collisions without destructive mutation", () => {
    const collision = socialIdentity({ _id: toSocialIdentityRef("other"), key: "github:ada" })
    return Effect.gen(function* () {
      const result = yield* repairPersonSocialIdentities({ person: { id: PersonId.make("person-1") } })
      expect(result.created).toBe(0)
      expect(result.unsupported[0]?.reason).toContain("different native identity ID")
    }).pipe(Effect.provide(Layer.merge(testClient({ identities: [socialIdentity(), collision] }), workspace)))
  })

  it.effect("refuses to overwrite a changed native identity", () => {
    const changed = socialIdentity({ value: "wrong@example.test" })
    return Effect.gen(function* () {
      const result = yield* repairPersonSocialIdentities({ person: { id: PersonId.make("person-1") } })
      expect(result.unchanged).toBe(0)
      expect(result.unsupported[0]?.reason).toContain("arbitrary mutation is unsupported")
    }).pipe(Effect.provide(Layer.merge(testClient({ identities: [changed] }), workspace)))
  })

  it.effect("applies Huly's native unverified-identity reassignment repair", () => {
    const updated: Array<string> = []
    const elsewhere = unverifiedSocialIdentity({
      _id: toSocialIdentityRef("social-2"),
      attachedTo: toRef<Person>("person-elsewhere"),
      key: "github:ada",
      type: SocialIdType.GITHUB,
      value: "ada"
    })
    return Effect.gen(function* () {
      const result = yield* repairPersonSocialIdentities({ person: { id: PersonId.make("person-1") } })
      expect(result.created).toBe(0)
      expect(result.updated).toBe(1)
      expect(updated).toContain("social-2")
    }).pipe(Effect.provide(Layer.merge(testClient({ identities: [socialIdentity(), elsewhere], updated }), workspace)))
  })

  it.effect("refuses to reassign a verified identity owned by another person", () => {
    const elsewhere = socialIdentity({
      _id: toSocialIdentityRef("social-2"),
      attachedTo: toRef<Person>("person-elsewhere"),
      key: "github:ada",
      type: SocialIdType.GITHUB,
      value: "ada",
      verifiedOn: 10
    })
    return Effect.gen(function* () {
      const result = yield* repairPersonSocialIdentities({ person: { id: PersonId.make("person-1") } })
      expect(result.updated).toBe(0)
      expect(result.unsupported[0]?.reason).toContain("reassignment is unsafe")
    }).pipe(Effect.provide(Layer.merge(testClient({ identities: [socialIdentity(), elsewhere] }), workspace)))
  })

  it.effect("propagates an account-authoritative identity deletion", () => {
    const updated: Array<string> = []
    const deletedWorkspace = WorkspaceClient.testLayer({
      getPersonInfo: () =>
        Effect.succeed({
          uuid: PERSON_UUID,
          name: "Lovelace,Ada",
          socialIds: [
            {
              _id: corePersonId("social-1"),
              type: SocialIdType.EMAIL,
              value: "deleted@example.test",
              key: "email:deleted@example.test",
              isDeleted: true
            }
          ]
        })
    })
    return Effect.gen(function* () {
      const result = yield* repairPersonSocialIdentities({ person: { id: PersonId.make("person-1") } })
      expect(result.updated).toBe(1)
      expect(updated).toEqual(["social-1"])
    }).pipe(Effect.provide(Layer.merge(testClient({ identities: [socialIdentity()], updated }), deletedWorkspace)))
  })

  it.effect("fails with a typed Huly-specific reason without personUuid", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(repairPersonSocialIdentities({ person: { id: PersonId.make("person-1") } }))
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const failure = exit.cause.reasons.find((reason) => reason._tag === "Fail")
        expect(failure?._tag === "Fail" && failure.error instanceof PersonIdentityRepairUnsupportedError).toBe(true)
      }
    }).pipe(Effect.provide(Layer.merge(testClient({ persons: [personWithoutUuid()] }), workspace)))
  )

  it.effect("rejects an ambiguous exact name", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(getPersonAdministration({ person: { name: PersonName.make("Lovelace,Ada") } }))
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const failure = exit.cause.reasons.find((reason) => reason._tag === "Fail")
        expect(failure?._tag === "Fail" && failure.error instanceof PersonIdentifierAmbiguousError).toBe(true)
      }
    }).pipe(
      Effect.provide(
        Layer.merge(testClient({ persons: [person(), person({ _id: toRef<Person>("person-2") })] }), workspace)
      )
    )
  )
})

describe("friendly person notes and attachments", () => {
  it.effect("creates and lists notes through the exact person target", () => {
    const addedData: Array<unknown> = []
    return Effect.gen(function* () {
      const params = yield* parseAddPersonCommentParams({
        person: { id: "person-1" },
        body: "Review [HULY-1](https://test.invalid/browse?workspace=test&_class=tracker%3Aclass%3AIssue&_id=issue-1&label=HULY-1)."
      })
      const added = yield* addPersonComment(params)
      expect(added.personId).toBe("person-1")
      expect(added.commentId).not.toBe("")
      const storedMarkup = String(Reflect.get(addedData[0] ?? {}, "message"))
      expect(storedMarkup).toContain('"type":"reference"')
      expect(storedMarkup).toContain('"id":"issue-1"')
      const listed = yield* listPersonComments({ person: params.person })
      expect(listed).toMatchObject({ personId: "person-1", comments: [], total: 0 })
    }).pipe(Effect.provide(testClient({ addedData })))
  })

  it.effect("uploads and lists attachments through the exact person target", () =>
    Effect.gen(function* () {
      const params = yield* parseAddPersonAttachmentParams({
        person: { id: "person-1" },
        filename: "note.txt",
        contentType: "text/plain",
        data: "aGVsbG8="
      })
      const added = yield* addPersonAttachment(params)
      expect(added.personId).toBe("person-1")
      expect(added.blobId).toBe("test-blob-id")
      const listed = yield* listPersonAttachments({ person: params.person })
      expect(listed).toMatchObject({ personId: "person-1", attachments: [], total: 0 })
    }).pipe(Effect.provide(Layer.merge(testClient({}), HulyStorageClient.testLayer({}))))
  )

  it.effect("lists, idempotently updates, and deletes only scoped person comments", () => {
    const updated: Array<string> = []
    const removed: Array<string> = []
    return Effect.gen(function* () {
      const listParams = yield* parseListPersonCommentsParams({ person: { id: "person-1" } })
      const listed = yield* listPersonComments(listParams)
      expect(listed.comments[0]?.body).toBe("Existing note")
      const same = yield* parseUpdatePersonCommentParams({
        person: { id: "person-1" },
        commentId: "comment-1",
        body: "Existing note"
      })
      expect((yield* updatePersonComment(same)).updated).toBe(false)
      const changed = yield* parseUpdatePersonCommentParams({ ...same, body: "Changed note" })
      expect((yield* updatePersonComment(changed)).updated).toBe(true)
      const deletion = yield* parseDeletePersonCommentParams({ person: { id: "person-1" }, commentId: "comment-1" })
      expect((yield* deletePersonComment(deletion)).deleted).toBe(true)
      expect(updated).toEqual(["comment-1"])
      expect(removed).toEqual(["comment-1"])
    }).pipe(Effect.provide(testClient({ messages: [message()], updated, removed })))
  })

  it.effect("lists, gets, updates, and deletes only scoped person attachments", () => {
    const updated: Array<string> = []
    const removed: Array<string> = []
    const client = testClient({ attachments: [personAttachment()], updated, removed })
    const layer = Layer.merge(client, HulyStorageClient.testLayer({}))
    return Effect.gen(function* () {
      const listParams = yield* parseListPersonAttachmentsParams({ person: { id: "person-1" } })
      expect((yield* listPersonAttachments(listParams)).attachments[0]?.name).toBe("note.txt")
      const getParams = yield* parseGetPersonAttachmentParams({
        person: { id: "person-1" },
        attachmentId: "attachment-1"
      })
      expect((yield* getPersonAttachment(getParams)).attachment.url).toContain("blob-1")
      const updateParams = yield* parseUpdatePersonAttachmentParams({
        person: { id: "person-1" },
        attachmentId: "attachment-1",
        pinned: true
      })
      expect((yield* updatePersonAttachment(updateParams)).updated).toBe(true)
      const deleteParams = yield* parseDeletePersonAttachmentParams({
        person: { id: "person-1" },
        attachmentId: "attachment-1"
      })
      expect((yield* deletePersonAttachment(deleteParams)).deleted).toBe(true)
      expect(updated).toEqual(["attachment-1"])
      expect(removed).toEqual(["attachment-1"])
    }).pipe(Effect.provide(layer))
  })
})
