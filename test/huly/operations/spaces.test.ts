import { describe, it } from "@effect/vitest"
import type { Channel, Employee, Person } from "@hcengineering/contact"
import type {
  Class,
  Doc,
  DocumentQuery,
  DocumentUpdate,
  FindOptions,
  FindResult,
  Permission,
  Ref,
  Role,
  Space,
  SpaceType,
  SpaceTypeDescriptor,
  TypedSpace
} from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import { Effect, Exit, Layer } from "effect"
import { expect } from "vitest"
import { assertAt } from "../../../src/utils/assertions.js"

import {
  NonEmptyString,
  ObjectClassName,
  RoleId,
  SpaceClassFilter,
  SpaceId,
  SpaceIdentifier,
  SpaceTypeId,
  SpaceTypeIdentifier
} from "../../../src/domain/schemas/shared.js"
import {
  parseUpdateSpaceParams,
  SpaceMemberIdentifier,
  SpaceRoleIdentifier
} from "../../../src/domain/schemas/spaces.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { Diagnostics, makeDiagnosticsScope } from "../../../src/huly/diagnostics.js"
import {
  SpaceIdentifierAmbiguousError,
  SpaceNotFoundError,
  SpaceNotTypedError,
  SpaceRoleAssignmentsMalformedError,
  SpaceRoleIdentifierAmbiguousError,
  SpaceRoleNotFoundError,
  SpaceTypeIdentifierAmbiguousError,
  SpaceTypeNotFoundError
} from "../../../src/huly/errors-spaces.js"
import { contact, core } from "../../../src/huly/huly-plugins.js"
import { testMarkupUrlConfig } from "../../../src/huly/operations/markup.js"
import { toAccountUuid, toRef } from "../../../src/huly/operations/sdk-boundary.js"
import {
  addSpaceMembers,
  addSpaceRoleMembers,
  getSpace,
  getSpaceType,
  listSpacePermissions,
  listSpaces,
  listSpaceTypes,
  removeSpaceMembers,
  removeSpaceRoleMembers,
  setSpaceOwners,
  setSpaceRoleMembers,
  updateSpace
} from "../../../src/huly/operations/spaces.js"
import { testWorkbenchUrlConfig } from "../../../src/huly/url-builders.js"
import { withDiagnostics } from "../../helpers/diagnostics.js"
import { corePersonId } from "../../helpers/huly-sdk.js"

type GenericSpace = Space & Partial<Pick<TypedSpace, "type">>

const personId = corePersonId("person-social-1")
const accountA = toAccountUuid("00000000-0000-4000-8000-000000000001")
const accountB = toAccountUuid("00000000-0000-4000-8000-000000000002")
const accountC = toAccountUuid("00000000-0000-4000-8000-000000000003")
const spaceIdentifier = (value: string) => SpaceIdentifier.make(value)
const spaceClassFilter = (value: string) => SpaceClassFilter.make(value)
const spaceTypeIdentifier = (value: string) => SpaceTypeIdentifier.make(value)
const spaceMemberIdentifier = (value: string) => SpaceMemberIdentifier.make(value)
const spaceRoleIdentifier = (value: string) => SpaceRoleIdentifier.make(value)
// Huly localizable strings and icon refs are branded SDK strings. Test fixture
// constants cross that SDK boundary with plain strings.
const intlString = (value: string): SpaceTypeDescriptor["name"] => value as SpaceTypeDescriptor["name"]
const descriptorIcon = (value: string): SpaceTypeDescriptor["icon"] => value as SpaceTypeDescriptor["icon"]

const exitCauseText = <A, E>(exit: Exit.Exit<A, E>): string => {
  if (Exit.isSuccess(exit)) throw new Error("Expected effect to fail")
  return exit.cause.toString()
}

const makeSpace = (overrides: Partial<GenericSpace> & Readonly<Record<string, unknown>> = {}): GenericSpace => ({
  _id: toRef<Space>("space-1"),
  _class: core.class.Space,
  space: core.space.Space,
  modifiedBy: personId,
  modifiedOn: 0,
  createdBy: personId,
  createdOn: 0,
  name: "General",
  description: "Default space",
  private: false,
  members: [accountA],
  owners: [],
  archived: false,
  ...overrides
})

const makeSpaceType = (overrides: Partial<SpaceType> = {}): SpaceType => ({
  _id: toRef<SpaceType>("space-type-1"),
  _class: core.class.SpaceType,
  space: core.space.Model,
  modifiedBy: personId,
  modifiedOn: 0,
  createdBy: personId,
  createdOn: 0,
  name: "Default Type",
  descriptor: toRef<SpaceTypeDescriptor>("descriptor-1"),
  targetClass: core.class.Space,
  roles: 1,
  ...overrides
})

const makeDescriptor = (overrides: Partial<SpaceTypeDescriptor> = {}): SpaceTypeDescriptor => ({
  _id: toRef<SpaceTypeDescriptor>("descriptor-1"),
  _class: core.class.SpaceTypeDescriptor,
  space: core.space.Model,
  modifiedBy: personId,
  modifiedOn: 0,
  createdBy: personId,
  createdOn: 0,
  name: intlString("Descriptor"),
  description: intlString("Descriptor description"),
  icon: descriptorIcon("icon"),
  baseClass: core.class.Space,
  availablePermissions: [toRef<Permission>("permission-update")],
  ...overrides
})

const makeRole = (overrides: Partial<Role> = {}): Role => ({
  _id: toRef<Role>("role-admin"),
  _class: core.class.Role,
  space: core.space.Model,
  modifiedBy: personId,
  modifiedOn: 0,
  createdBy: personId,
  createdOn: 0,
  attachedTo: toRef<SpaceType>("space-type-1"),
  attachedToClass: core.class.SpaceType,
  collection: "roles",
  name: "Admins",
  permissions: [toRef<Permission>("permission-update")],
  ...overrides
})

const makePermission = (overrides: Partial<Permission> = {}): Permission => ({
  _id: toRef<Permission>("permission-update"),
  _class: core.class.Permission,
  space: core.space.Model,
  modifiedBy: personId,
  modifiedOn: 0,
  createdBy: personId,
  createdOn: 0,
  label: intlString("Update space"),
  description: intlString("Can update spaces"),
  scope: "space",
  objectClass: core.class.Space,
  ...overrides
})

const makePerson = (overrides: Partial<Person> = {}): Person => {
  const data = {
    _id: toRef<Person>("person-1"),
    _class: contact.class.Person,
    space: contact.space.Contacts,
    modifiedBy: personId,
    modifiedOn: 0,
    createdBy: personId,
    createdOn: 0,
    name: "Doe,Jane",
    city: "",
    ...overrides
  }

  // SDK Person has exact optional generated fields; the fixture supplies all
  // fields read by these tests and allows per-test SDK overrides.
  return data as Person
}

const makeChannel = (overrides: Partial<Channel> = {}): Channel => ({
  _id: toRef<Channel>("channel-1"),
  _class: contact.class.Channel,
  space: contact.space.Contacts,
  modifiedBy: personId,
  modifiedOn: 0,
  createdBy: personId,
  createdOn: 0,
  attachedTo: toRef<Person>("person-1"),
  attachedToClass: contact.class.Person,
  collection: "channels",
  provider: contact.channelProvider.Email,
  value: "jane@example.com",
  ...overrides
})

const makeEmployee = (overrides: Partial<Employee> = {}): Employee => {
  const data = {
    _id: toRef<Employee>("person-1"),
    _class: contact.mixin.Employee,
    space: contact.space.Contacts,
    modifiedBy: personId,
    modifiedOn: 0,
    createdBy: personId,
    createdOn: 0,
    name: "Doe,Jane",
    active: true,
    personUuid: accountB,
    ...overrides
  }

  // SDK Employee extends generated Person/mixin fields; tests only exercise
  // personUuid and document identity, with per-test SDK overrides.
  return data as Employee
}

interface MockConfig {
  readonly spaces?: ReadonlyArray<GenericSpace>
  readonly spaceTypes?: ReadonlyArray<SpaceType>
  readonly descriptors?: ReadonlyArray<SpaceTypeDescriptor>
  readonly roles?: ReadonlyArray<Role>
  readonly permissions?: ReadonlyArray<Permission>
  readonly persons?: ReadonlyArray<Person>
  readonly channels?: ReadonlyArray<Channel>
  readonly employees?: ReadonlyArray<Employee>
  readonly captureUpdate?: { operations?: unknown; id?: string }
  readonly captureMixin?: { action?: "create" | "update"; attributes?: unknown; id?: string; mixin?: string }
  readonly captureFindOptions?: Array<FindOptions<Doc> | undefined>
  readonly sdkTotal?: number
}

type QueryRecord = Readonly<Record<string, unknown>>
type DocRecord = Readonly<Record<string, unknown>>

const hasInOperator = (value: unknown): value is { readonly $in: ReadonlyArray<unknown> } =>
  typeof value === "object" && value !== null && "$in" in value && Array.isArray(value.$in)

const toQueryRecord = <T extends Doc>(query: DocumentQuery<T>): QueryRecord => {
  // DocumentQuery<T> is a structurally keyed SDK object. The fake client only
  // needs runtime key/value matching for simple query literals.
  // eslint-disable-next-line no-restricted-syntax -- test-only structural query matcher
  return query as unknown as QueryRecord
}

const toDocRecord = (doc: Doc): DocRecord => {
  // Huly docs are plain objects at runtime; the fake client indexes by query key
  // to emulate SDK filtering in tests.
  // eslint-disable-next-line no-restricted-syntax -- test-only structural document matcher
  return doc as unknown as DocRecord
}

const matchesQuery = (doc: Doc, query: QueryRecord): boolean =>
  Object.entries(query).every(([key, value]) => {
    const actual = toDocRecord(doc)[key]
    if (hasInOperator(value)) {
      const ids = value.$in
      return ids.includes(actual)
    }
    return actual === value
  })

const toResult = <T extends Doc>(docs: ReadonlyArray<T>, total?: number): FindResult<T> =>
  toFindResult([...docs], total)

const createTestLayer = (config: MockConfig) => {
  const spaces = [...(config.spaces ?? [])]
  const spaceTypes = [...(config.spaceTypes ?? [])]
  const descriptors = [...(config.descriptors ?? [])]
  const roles = [...(config.roles ?? [])]
  const permissions = [...(config.permissions ?? [])]
  const persons = [...(config.persons ?? [])]
  const channels = [...(config.channels ?? [])]
  const employees = [...(config.employees ?? [])]

  const findAll: HulyClientOperations["findAll"] = <T extends Doc>(
    _class: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ) => {
    // Brands erased at runtime; FindOptions<T> is safe to retain as FindOptions<Doc>
    // for test assertions about transport options only.
    config.captureFindOptions?.push(options as FindOptions<Doc> | undefined)
    const queryRecord = toQueryRecord(query)
    const matchingDocs = (() => {
      if (_class === core.class.Space) return spaces.filter((doc) => matchesQuery(doc, queryRecord))
      if (_class === core.class.SpaceType) {
        return spaceTypes.filter((doc) => matchesQuery(doc, queryRecord))
      }
      if (_class === core.class.SpaceTypeDescriptor) {
        return descriptors.filter((doc) => matchesQuery(doc, queryRecord))
      }
      if (_class === core.class.Role) return roles.filter((doc) => matchesQuery(doc, queryRecord))
      if (_class === core.class.Permission) {
        return permissions.filter((doc) => matchesQuery(doc, queryRecord))
      }
      if (_class === contact.class.Person) return persons.filter((doc) => matchesQuery(doc, queryRecord))
      if (_class === contact.class.Channel) {
        return channels.filter((doc) => matchesQuery(doc, queryRecord))
      }
      if (_class === contact.mixin.Employee) {
        return employees.filter((doc) => matchesQuery(doc, queryRecord))
      }
      return []
    })()

    const limitedDocs = options?.limit === undefined ? matchingDocs : matchingDocs.slice(0, options.limit)

    // The selected fixture array is determined by the same class ref supplied to
    // the generic SDK method; Huly refs are phantom-branded strings at runtime.
    // eslint-disable-next-line no-restricted-syntax -- brands erased at runtime; class branch selects T fixtures
    return Effect.succeed(toResult(limitedDocs as unknown as ReadonlyArray<T>, config.sdkTotal))
  }

  const findOne: HulyClientOperations["findOne"] = <T extends Doc>(_class: Ref<Class<T>>, query: DocumentQuery<T>) =>
    findAll(_class, query).pipe(Effect.map((result) => result.at(0)))

  const client: HulyClientOperations = {
    getAccountUuid: () => accountA,
    getPrimarySocialId: () => personId,
    markupUrlConfig: testMarkupUrlConfig,
    workbenchUrlConfig: testWorkbenchUrlConfig,
    findAll,
    findAllInModel: findAll,
    findOne,
    createDoc: () => Effect.die(new Error("not implemented")),
    updateDoc: <T extends Doc>(
      _class: Ref<Class<T>>,
      _space: Ref<Space>,
      objectId: Ref<T>,
      operations: DocumentUpdate<T>
    ) => {
      if (config.captureUpdate !== undefined) {
        config.captureUpdate.id = String(objectId)
        config.captureUpdate.operations = operations
      }
      return Effect.succeed([])
    },
    addCollection: () => Effect.die(new Error("not implemented")),
    removeDoc: () => Effect.die(new Error("not implemented")),
    uploadMarkup: () => Effect.die(new Error("not implemented")),
    fetchMarkup: () => Effect.succeed(""),
    updateMarkup: () => Effect.die(new Error("not implemented")),
    updateMixin: (_objectId, _objectClass, _objectSpace, mixin, attributes) => {
      if (config.captureMixin !== undefined) {
        config.captureMixin.action = "update"
        config.captureMixin.id = String(_objectId)
        config.captureMixin.mixin = String(mixin)
        config.captureMixin.attributes = attributes
      }
      return Effect.succeed([])
    },
    createMixin: (_objectId, _objectClass, _objectSpace, mixin, attributes) => {
      if (config.captureMixin !== undefined) {
        config.captureMixin.action = "create"
        config.captureMixin.id = String(_objectId)
        config.captureMixin.mixin = String(mixin)
        config.captureMixin.attributes = attributes
      }
      return Effect.succeed([])
    },
    searchFulltext: () => Effect.die(new Error("not implemented"))
  }

  return Layer.succeed(HulyClient, client)
}

describe("space domain errors", () => {
  it("formats not found and ambiguity messages with actionable identifiers", () => {
    const spaceNotFound = new SpaceNotFoundError({ identifier: NonEmptyString.make("Missing") })
    const spaceAmbiguous = new SpaceIdentifierAmbiguousError({
      identifier: NonEmptyString.make("Shared"),
      matches: [
        {
          id: SpaceId.make("space-a"),
          name: NonEmptyString.make("Shared"),
          class: ObjectClassName.make("module:class:A")
        },
        {
          id: SpaceId.make("space-b"),
          name: NonEmptyString.make("Shared"),
          class: ObjectClassName.make("module:class:B"),
          type: SpaceTypeId.make("space-type-b")
        }
      ]
    })
    const spaceTypeNotFound = new SpaceTypeNotFoundError({ identifier: NonEmptyString.make("Missing Type") })
    const spaceTypeAmbiguous = new SpaceTypeIdentifierAmbiguousError({
      identifier: NonEmptyString.make("Default"),
      matches: [
        {
          id: SpaceTypeId.make("type-a"),
          name: NonEmptyString.make("Default"),
          targetClass: ObjectClassName.make("module:class:A")
        },
        {
          id: SpaceTypeId.make("type-b"),
          name: NonEmptyString.make("Default"),
          targetClass: ObjectClassName.make("module:class:B")
        }
      ]
    })
    const spaceNotTyped = new SpaceNotTypedError({
      id: SpaceId.make("space-1"),
      name: NonEmptyString.make("General")
    })
    const roleNotFound = new SpaceRoleNotFoundError({
      identifier: NonEmptyString.make("Admins"),
      spaceType: SpaceTypeId.make("space-type-1")
    })
    const roleAmbiguous = new SpaceRoleIdentifierAmbiguousError({
      identifier: NonEmptyString.make("Admins"),
      spaceType: SpaceTypeId.make("space-type-1"),
      matches: [
        { id: RoleId.make("role-a"), name: NonEmptyString.make("Admins") },
        { id: RoleId.make("role-b"), name: NonEmptyString.make("Admins") }
      ]
    })

    expect(spaceNotFound.message).toBe("Space 'Missing' not found")
    expect(spaceAmbiguous.message).toContain("space-a (module:class:A)")
    expect(spaceAmbiguous.message).toContain("space-b (module:class:B, type space-type-b)")
    expect(spaceTypeNotFound.message).toBe("Space type 'Missing Type' not found")
    expect(spaceTypeAmbiguous.message).toContain("type-b (module:class:B)")
    expect(spaceNotTyped.message).toContain("is not typed")
    expect(roleNotFound.message).toContain("Role 'Admins' not found in space type 'space-type-1'")
    expect(roleAmbiguous.message).toContain("role-b (Admins)")
  })
})

describe("space schemas", () => {
  it.effect("accepts update params with safe fields and rejects empty updates", () =>
    Effect.gen(function*() {
      const valid = yield* parseUpdateSpaceParams({ space: "space-1", name: "Renamed" })
      const empty = yield* Effect.exit(parseUpdateSpaceParams({ space: "space-1" }))

      expect(valid).toMatchObject({ space: "space-1", name: "Renamed" })
      expect(exitCauseText(empty)).toContain("At least one update field must be provided")
    }))
})

describe("spaces operations", () => {
  it.effect("listSpaces filters archived by default and includes archived when requested", () =>
    Effect.gen(function*() {
      const active = makeSpace({ _id: toRef<Space>("active"), name: "Active" })
      const archived = makeSpace({ _id: toRef<Space>("archived"), name: "Archived", archived: true })
      const { owners: _owners, ...withoutOwners } = makeSpace({
        _id: toRef<Space>("without-owners"),
        name: "No Owners"
      })
      const layer = createTestLayer({ spaces: [active, archived, withoutOwners] })

      const defaultResult = yield* listSpaces({}).pipe(Effect.provide(layer))
      const allResult = yield* listSpaces({ includeArchived: true }).pipe(Effect.provide(layer))

      expect(defaultResult.spaces.map((space) => space.id)).toEqual(["active", "without-owners"])
      expect(defaultResult.spaces.find((space) => space.id === "without-owners")?.ownersCount).toBe(0)
      expect(allResult.spaces.map((space) => space.id)).toEqual(["active", "archived", "without-owners"])
    }))

  it.effect("getSpace resolves by id, resolves exact names, and rejects ambiguous names", () =>
    Effect.gen(function*() {
      const first = makeSpace({ _id: toRef<Space>("space-a"), name: "Shared", _class: toRef("module:class:A") })
      const second = makeSpace({
        _id: toRef<Space>("space-b"),
        name: "Shared",
        _class: toRef("module:class:B"),
        type: toRef<SpaceType>("space-type-b")
      })
      const layer = createTestLayer({ spaces: [first, second] })

      const byId = yield* getSpace({ space: spaceIdentifier("space-a") }).pipe(Effect.provide(layer), withDiagnostics)
      const narrowed = yield* getSpace({
        space: spaceIdentifier("Shared"),
        class: spaceClassFilter("module:class:B")
      }).pipe(Effect.provide(layer), withDiagnostics)
      const ambiguous = yield* Effect.exit(
        getSpace({ space: spaceIdentifier("Shared") }).pipe(Effect.provide(layer), withDiagnostics)
      )
      const missing = yield* Effect.exit(
        getSpace({ space: spaceIdentifier("Missing") }).pipe(Effect.provide(layer), withDiagnostics)
      )

      expect(byId.id).toBe("space-a")
      expect(narrowed.id).toBe("space-b")
      expect(Exit.isFailure(ambiguous)).toBe(true)
      expect(exitCauseText(ambiguous)).toContain("SpaceIdentifierAmbiguousError")
      expect(Exit.isFailure(missing)).toBe(true)
      expect(exitCauseText(missing)).toContain("SpaceNotFoundError")
    }))

  it.effect("getSpace defaults missing owners to an empty array", () =>
    Effect.gen(function*() {
      const { owners: _owners, ...space } = makeSpace()
      const layer = createTestLayer({ spaces: [space] })

      const result = yield* getSpace({ space: spaceIdentifier("space-1") }).pipe(Effect.provide(layer), withDiagnostics)

      expect(result.owners).toEqual([])
    }))

  it.effect("getSpace returns existing owners", () =>
    Effect.gen(function*() {
      const layer = createTestLayer({ spaces: [makeSpace({ owners: [accountB] })] })

      const result = yield* getSpace({ space: spaceIdentifier("space-1") }).pipe(Effect.provide(layer), withDiagnostics)

      expect(result.owners).toEqual([accountB])
    }))

  it.effect("getSpace exposes role assignment data when present", () =>
    Effect.gen(function*() {
      const { owners: _owners, ...space } = makeSpace({
        type: toRef<SpaceType>("space-type-1"),
        [core.class.Space]: {
          "role-admin": [accountA],
          "role-empty": [],
          customTags: ["custom-a", "custom-b"],
          ignored: "not a member list"
        }
      })
      const layer = createTestLayer({
        spaces: [space],
        spaceTypes: [makeSpaceType({ roles: 2 })],
        roles: [
          makeRole(),
          makeRole({ _id: toRef<Role>("role-empty"), name: "Empty" })
        ]
      })

      const result = yield* getSpace({ space: spaceIdentifier("space-1") }).pipe(Effect.provide(layer), withDiagnostics)

      expect(result.type).toBe("space-type-1")
      expect(result.owners).toEqual([])
      expect(result.roleAssignments).toEqual([
        { roleId: "role-admin", members: [accountA] },
        { roleId: "role-empty", members: [] }
      ])
    }))

  it.effect("getSpace hides custom array fields when typed-space role assignments are empty", () =>
    Effect.gen(function*() {
      const { owners: _owners, ...space } = makeSpace({
        type: toRef<SpaceType>("space-type-1"),
        [core.class.Space]: {
          customTags: ["custom-a", "custom-b"]
        }
      })
      const layer = createTestLayer({
        spaces: [space],
        spaceTypes: [makeSpaceType()],
        roles: [makeRole()]
      })

      const result = yield* getSpace({ space: spaceIdentifier("space-1") }).pipe(Effect.provide(layer), withDiagnostics)

      expect(result.roleAssignments).toBeUndefined()
    }))

  it.effect("getSpace returns no role assignments and no warnings when the typed-space mixin is absent", () =>
    Effect.gen(function*() {
      const { owners: _owners, ...space } = makeSpace({
        type: toRef<SpaceType>("space-type-1")
      })
      const layer = createTestLayer({
        spaces: [space],
        spaceTypes: [makeSpaceType()],
        roles: [makeRole()]
      })
      const diagnostics = yield* makeDiagnosticsScope

      const result = yield* getSpace({ space: spaceIdentifier("space-1") }).pipe(
        Effect.provide(layer),
        Effect.provideService(Diagnostics, diagnostics.service)
      )
      const warnings = yield* diagnostics.drainWarnings

      expect(result.roleAssignments).toBeUndefined()
      expect(warnings).toEqual([])
    }))

  it.effect("getSpace drops malformed role assignment data and warns the agent", () =>
    Effect.gen(function*() {
      const malformedMember = "not-an-account-uuid"
      const { owners: _owners, ...space } = makeSpace({
        type: toRef<SpaceType>("space-type-1"),
        [core.class.Space]: {
          "role-admin": [accountA, malformedMember],
          "role-viewer": "not an array",
          "role-unknown": [accountB]
        }
      })
      const layer = createTestLayer({
        spaces: [space],
        spaceTypes: [makeSpaceType({ roles: 2 })],
        roles: [
          makeRole(),
          makeRole({ _id: toRef<Role>("role-viewer"), name: "Viewers" })
        ]
      })
      const diagnostics = yield* makeDiagnosticsScope

      const result = yield* getSpace({ space: spaceIdentifier("space-1") }).pipe(
        Effect.provide(layer),
        Effect.provideService(Diagnostics, diagnostics.service)
      )
      const warnings = yield* diagnostics.drainWarnings

      expect(result.roleAssignments).toEqual([{ roleId: "role-admin", members: [accountA] }])
      expect(warnings).toHaveLength(1)
      expect(assertAt(warnings, 0).code).toBe("space_role_assignments_degraded")
      expect(assertAt(warnings, 0).message).toContain("role-viewer")
      expect(assertAt(warnings, 0).message).toContain("role-unknown")
      expect(assertAt(warnings, 0).message).toContain("malformed account UUID")
    }))

  it.effect("getSpace drops a non-object role assignment mixin and warns the agent", () =>
    Effect.gen(function*() {
      const { owners: _owners, ...space } = makeSpace({
        type: toRef<SpaceType>("space-type-1"),
        [core.class.Space]: "not an assignment object"
      })
      const layer = createTestLayer({
        spaces: [space],
        spaceTypes: [makeSpaceType()],
        roles: [makeRole()]
      })
      const diagnostics = yield* makeDiagnosticsScope

      const result = yield* getSpace({ space: spaceIdentifier("space-1") }).pipe(
        Effect.provide(layer),
        Effect.provideService(Diagnostics, diagnostics.service)
      )
      const warnings = yield* diagnostics.drainWarnings

      expect(result.roleAssignments).toBeUndefined()
      expect(warnings).toHaveLength(1)
      expect(assertAt(warnings, 0).code).toBe("space_role_assignments_degraded")
      expect(assertAt(warnings, 0).message).toContain("role assignment mixin core:class:Space is not an object")
    }))

  it.effect("listSpaces filters by raw class and type", () =>
    Effect.gen(function*() {
      const typeA = toRef<SpaceType>("space-type-a")
      const typeB = toRef<SpaceType>("space-type-b")
      const first = makeSpace({ _id: toRef<Space>("space-a"), _class: toRef("module:class:A"), type: typeA })
      const second = makeSpace({ _id: toRef<Space>("space-b"), _class: toRef("module:class:B"), type: typeB })
      const layer = createTestLayer({ spaces: [first, second] })

      const result = yield* listSpaces({
        class: spaceClassFilter("module:class:B"),
        type: SpaceTypeId.make("space-type-b")
      }).pipe(Effect.provide(layer))

      expect(result.spaces.map((space) => space.id)).toEqual(["space-b"])
      expect(assertAt(result.spaces, 0).type).toBe("space-type-b")
    }))

  it.effect("listSpaces requests and returns a counted SDK total", () =>
    Effect.gen(function*() {
      const captureFindOptions: Array<FindOptions<Doc> | undefined> = []
      const layer = createTestLayer({ spaces: [makeSpace()], captureFindOptions, sdkTotal: 7 })

      const result = yield* listSpaces({}).pipe(Effect.provide(layer))

      expect(result.spaces).toHaveLength(1)
      expect(result.total).toBe(7)
      expect(assertAt(captureFindOptions, 0)).toMatchObject({ total: true })
    }))

  it.effect("listSpaceTypes and getSpaceType include descriptors, roles, and permissions", () =>
    Effect.gen(function*() {
      const type = makeSpaceType({ members: [accountA], autoJoin: true, shortDescription: "Short type" })
      const descriptor = makeDescriptor()
      const role = makeRole()
      const permission = makePermission()
      const layer = createTestLayer({
        spaceTypes: [type],
        descriptors: [descriptor],
        roles: [role],
        permissions: [permission]
      })

      const listed = yield* listSpaceTypes({}).pipe(Effect.provide(layer))
      const detail = yield* getSpaceType({ spaceType: spaceTypeIdentifier("space-type-1") }).pipe(Effect.provide(layer))

      expect(assertAt(listed.spaceTypes, 0)).toMatchObject({
        id: "space-type-1",
        descriptor: "descriptor-1",
        baseClass: core.class.Space,
        targetClass: core.class.Space,
        rolesCount: 1
      })
      expect(assertAt(detail.roles, 0)).toMatchObject({
        id: "role-admin",
        name: "Admins",
        permissions: ["permission-update"],
        permissionLabels: ["Update space"]
      })
      expect(detail.shortDescription).toBe("Short type")
      expect(assertAt(detail.availablePermissions, 0).id).toBe("permission-update")
    }))

  it.effect("listSpaceTypes filters targetClass and handles missing descriptors", () =>
    Effect.gen(function*() {
      const matching = makeSpaceType({ _id: toRef<SpaceType>("space-type-a"), targetClass: toRef("module:class:A") })
      const other = makeSpaceType({ _id: toRef<SpaceType>("space-type-b"), targetClass: toRef("module:class:B") })
      const layer = createTestLayer({ spaceTypes: [matching, other] })

      const result = yield* listSpaceTypes({ targetClass: spaceClassFilter("module:class:A") }).pipe(
        Effect.provide(layer)
      )

      expect(result.spaceTypes).toHaveLength(1)
      expect(assertAt(result.spaceTypes, 0)).toMatchObject({
        id: "space-type-a",
        baseClass: undefined,
        targetClass: "module:class:A"
      })

      const empty = yield* listSpaceTypes({}).pipe(Effect.provide(createTestLayer({ spaceTypes: [] })))
      expect(empty.spaceTypes).toEqual([])
    }))

  it.effect("getSpaceType resolves empty metadata and reports missing or ambiguous names", () =>
    Effect.gen(function*() {
      const typeA = makeSpaceType({ _id: toRef<SpaceType>("space-type-a"), name: "Shared Type" })
      const typeB = makeSpaceType({ _id: toRef<SpaceType>("space-type-b"), name: "Shared Type" })
      const layer = createTestLayer({ spaceTypes: [typeA, typeB] })

      const detail = yield* getSpaceType({ spaceType: spaceTypeIdentifier("space-type-a") }).pipe(Effect.provide(layer))
      const missing = yield* Effect.exit(
        getSpaceType({ spaceType: spaceTypeIdentifier("Missing Type") }).pipe(Effect.provide(layer))
      )
      const ambiguous = yield* Effect.exit(
        getSpaceType({ spaceType: spaceTypeIdentifier("Shared Type") }).pipe(Effect.provide(layer))
      )

      expect(detail).toMatchObject({
        id: "space-type-a",
        descriptorName: undefined,
        availablePermissions: [],
        roles: []
      })
      expect(exitCauseText(missing)).toContain("SpaceTypeNotFoundError")
      expect(exitCauseText(ambiguous)).toContain("SpaceTypeIdentifierAmbiguousError")
    }))

  it.effect("getSpaceType resolves by exact name when one name matches", () =>
    Effect.gen(function*() {
      const layer = createTestLayer({ spaceTypes: [makeSpaceType({ name: "Named Type" })] })

      const detail = yield* getSpaceType({ spaceType: spaceTypeIdentifier("Named Type") }).pipe(Effect.provide(layer))

      expect(detail.id).toBe("space-type-1")
    }))

  it.effect("listSpacePermissions filters by scope, objectClass, and search", () =>
    Effect.gen(function*() {
      const updatePermission = makePermission()
      const workspacePermission = makePermission({
        _id: toRef<Permission>("permission-workspace"),
        label: intlString("Workspace admin"),
        scope: "workspace"
      })
      const layer = createTestLayer({ permissions: [updatePermission, workspacePermission] })

      const result = yield* listSpacePermissions({
        scope: "space",
        objectClass: spaceClassFilter(core.class.Space),
        search: "update"
      }).pipe(Effect.provide(layer))

      expect(result.permissions.map((permission) => permission.id)).toEqual(["permission-update"])
      expect(result.total).toBe(1)
    }))

  it.effect("listSpacePermissions applies search before limit", () =>
    Effect.gen(function*() {
      const firstPermission = makePermission({
        _id: toRef<Permission>("permission-first"),
        label: intlString("Alpha")
      })
      const matchingPermission = makePermission({
        _id: toRef<Permission>("permission-target"),
        label: intlString("Target permission")
      })
      const layer = createTestLayer({ permissions: [firstPermission, matchingPermission] })

      const result = yield* listSpacePermissions({ search: "target", limit: 1 }).pipe(Effect.provide(layer))

      expect(result.permissions.map((permission) => permission.id)).toEqual(["permission-target"])
      expect(result.total).toBe(1)
    }))

  it.effect("listSpacePermissions handles unfiltered permissions without descriptions", () =>
    Effect.gen(function*() {
      const { description: _description, objectClass: _objectClass, ...permission } = makePermission()
      const result = yield* listSpacePermissions({}).pipe(
        Effect.provide(createTestLayer({ permissions: [permission] }))
      )

      expect(assertAt(result.permissions, 0)).toMatchObject({
        id: "permission-update",
        description: undefined,
        objectClass: undefined
      })
    }))

  it.effect("updateSpace sends only provided safe fields", () =>
    Effect.gen(function*() {
      const captureUpdate: MockConfig["captureUpdate"] = {}
      const layer = createTestLayer({ spaces: [makeSpace()], captureUpdate })

      const result = yield* updateSpace({ space: spaceIdentifier("space-1"), private: true, description: "" }).pipe(
        Effect.provide(layer)
      )

      expect(result.updated).toBe(true)
      expect(captureUpdate.operations).toEqual({ private: true, description: "" })
    }))

  it.effect("updateSpace clears description when set to null", () =>
    Effect.gen(function*() {
      const captureUpdate: MockConfig["captureUpdate"] = {}

      yield* updateSpace({ space: spaceIdentifier("space-1"), description: null }).pipe(
        Effect.provide(createTestLayer({ spaces: [makeSpace()], captureUpdate }))
      )

      expect(captureUpdate.operations).toEqual({ description: "" })
    }))

  it.effect("updateSpace can send all safe metadata fields", () =>
    Effect.gen(function*() {
      const captureUpdate: MockConfig["captureUpdate"] = {}
      const layer = createTestLayer({ spaces: [makeSpace()], captureUpdate })

      yield* updateSpace({
        space: spaceIdentifier("space-1"),
        name: "Renamed",
        description: "Updated",
        private: true,
        archived: true,
        autoJoin: false
      }).pipe(Effect.provide(layer))

      expect(captureUpdate.operations).toEqual({
        name: "Renamed",
        description: "Updated",
        private: true,
        archived: true,
        autoJoin: false
      })

      const nameOnlyUpdate: MockConfig["captureUpdate"] = {}
      yield* updateSpace({ space: spaceIdentifier("space-1"), name: "Name Only" }).pipe(
        Effect.provide(createTestLayer({ spaces: [makeSpace()], captureUpdate: nameOnlyUpdate }))
      )
      expect(nameOnlyUpdate.operations).toEqual({ name: "Name Only" })
    }))

  it.effect("member mutations are idempotent, dedupe accounts, and preserve unrelated members", () =>
    Effect.gen(function*() {
      const captureAdd: MockConfig["captureUpdate"] = {}
      const baseSpace = makeSpace({ members: [accountA] })
      const layer = createTestLayer({
        spaces: [baseSpace],
        persons: [makePerson()],
        channels: [makeChannel()],
        employees: [makeEmployee()],
        captureUpdate: captureAdd
      })

      const added = yield* addSpaceMembers({
        space: spaceIdentifier("space-1"),
        members: [
          spaceMemberIdentifier(accountA),
          spaceMemberIdentifier("jane@example.com"),
          spaceMemberIdentifier("jane@example.com")
        ]
      }).pipe(Effect.provide(layer))
      const removeNoop = yield* removeSpaceMembers({
        space: spaceIdentifier("space-1"),
        members: [spaceMemberIdentifier(accountC)]
      }).pipe(Effect.provide(createTestLayer({ spaces: [baseSpace] })))
      const addNoop = yield* addSpaceMembers({
        space: spaceIdentifier("space-1"),
        members: [spaceMemberIdentifier(accountA)]
      }).pipe(Effect.provide(createTestLayer({ spaces: [baseSpace] })))

      expect(added.members).toEqual([accountA, accountB])
      expect(added.changed).toBe(true)
      expect(captureAdd.operations).toEqual({ members: [accountA, accountB] })
      expect(removeNoop.members).toEqual([accountA])
      expect(removeNoop.changed).toBe(false)
      expect(addNoop.changed).toBe(false)
    }))

  it.effect("removeSpaceMembers replaces members when accounts are present", () =>
    Effect.gen(function*() {
      const captureUpdate: MockConfig["captureUpdate"] = {}
      const layer = createTestLayer({ spaces: [makeSpace({ members: [accountA, accountB] })], captureUpdate })

      const result = yield* removeSpaceMembers({
        space: spaceIdentifier("space-1"),
        members: [spaceMemberIdentifier(accountB)]
      }).pipe(Effect.provide(layer))

      expect(result.members).toEqual([accountA])
      expect(result.changed).toBe(true)
      expect(captureUpdate.operations).toEqual({ members: [accountA] })
    }))

  it.effect("setSpaceOwners replaces owners and ensures owners are members by default", () =>
    Effect.gen(function*() {
      const captureUpdate: MockConfig["captureUpdate"] = {}
      const layer = createTestLayer({
        spaces: [makeSpace({ members: [accountA], owners: [accountA] })],
        captureUpdate
      })

      const result = yield* setSpaceOwners({
        space: spaceIdentifier("space-1"),
        owners: [spaceMemberIdentifier(accountB)]
      }).pipe(Effect.provide(layer))

      expect(result.owners).toEqual([accountB])
      expect(result.members).toEqual([accountA, accountB])
      expect(captureUpdate.operations).toEqual({ owners: [accountB], members: [accountA, accountB] })
    }))

  it.effect("setSpaceOwners can skip member enforcement and report no-op owner replacement", () =>
    Effect.gen(function*() {
      const skipMembersUpdate: MockConfig["captureUpdate"] = {}
      const noChangeUpdate: MockConfig["captureUpdate"] = {}
      const { owners: _owners, ...spaceWithoutOwners } = makeSpace({ members: [accountA] })

      const skipMembers = yield* setSpaceOwners({
        space: spaceIdentifier("space-1"),
        owners: [spaceMemberIdentifier(accountB)],
        ensureMembers: false
      }).pipe(Effect.provide(createTestLayer({
        spaces: [makeSpace({ members: [accountA], owners: [accountA] })],
        captureUpdate: skipMembersUpdate
      })))
      const noChange = yield* setSpaceOwners({
        space: spaceIdentifier("space-1"),
        owners: [spaceMemberIdentifier(accountA)],
        ensureMembers: false
      }).pipe(Effect.provide(createTestLayer({
        spaces: [makeSpace({ members: [accountA], owners: [accountA] })],
        captureUpdate: noChangeUpdate
      })))
      const missingOwners = yield* setSpaceOwners({
        space: spaceIdentifier("space-1"),
        owners: [spaceMemberIdentifier(accountA)],
        ensureMembers: false
      }).pipe(Effect.provide(createTestLayer({ spaces: [spaceWithoutOwners] })))

      expect(skipMembers.members).toEqual([accountA])
      expect(skipMembersUpdate.operations).toEqual({ owners: [accountB] })
      expect(noChange.changed).toBe(false)
      expect(noChangeUpdate.operations).toBeUndefined()
      expect(missingOwners.owners).toEqual([accountA])
    }))

  it.effect("setSpaceRoleMembers replaces only the targeted typed-space role assignment", () =>
    Effect.gen(function*() {
      const captureMixin: MockConfig["captureMixin"] = {}
      const space = makeSpace({
        type: toRef<SpaceType>("space-type-1"),
        [core.class.Space]: {
          "role-admin": [accountA],
          "role-viewer": [accountC]
        }
      })
      const layer = createTestLayer({
        spaces: [space],
        spaceTypes: [makeSpaceType({ roles: 2 })],
        roles: [
          makeRole({ attachedToClass: toRef<Class<Doc>>("custom:class:SpaceType") }),
          makeRole({ _id: toRef<Role>("role-viewer"), name: "Viewers" })
        ],
        persons: [makePerson()],
        channels: [makeChannel()],
        employees: [makeEmployee()],
        captureMixin
      })

      const result = yield* setSpaceRoleMembers({
        space: spaceIdentifier("space-1"),
        role: spaceRoleIdentifier("Admins"),
        members: [spaceMemberIdentifier("jane@example.com")]
      }).pipe(Effect.provide(layer))

      expect(result).toMatchObject({ id: "space-1", roleId: "role-admin", members: [accountB], changed: true })
      expect(captureMixin).toMatchObject({
        action: "update",
        id: "space-1",
        mixin: core.class.Space,
        attributes: { "role-admin": [accountB], "role-viewer": [accountC] }
      })
    }))

  it.effect("space role member mutations reject malformed existing role assignment storage before writing", () =>
    Effect.gen(function*() {
      const unknownRoleMixin: MockConfig["captureMixin"] = {}
      const malformedMembersMixin: MockConfig["captureMixin"] = {}
      const unknownRoleStorage = makeSpace({
        type: toRef<SpaceType>("space-type-1"),
        [core.class.Space]: {
          "role-admin": [accountA],
          "role-unknown": [accountB]
        }
      })
      const malformedMemberStorage = makeSpace({
        type: toRef<SpaceType>("space-type-1"),
        [core.class.Space]: {
          "role-admin": [accountA],
          "role-viewer": ["not-an-account-uuid"]
        }
      })

      const unknownRoleError = yield* Effect.flip(
        setSpaceRoleMembers({
          space: spaceIdentifier("space-1"),
          role: spaceRoleIdentifier("role-admin"),
          members: [spaceMemberIdentifier(accountB)]
        }).pipe(Effect.provide(createTestLayer({
          spaces: [unknownRoleStorage],
          spaceTypes: [makeSpaceType({ roles: 2 })],
          roles: [
            makeRole(),
            makeRole({ _id: toRef<Role>("role-viewer"), name: "Viewers" })
          ],
          captureMixin: unknownRoleMixin
        })))
      )

      const malformedMembersError = yield* Effect.flip(
        setSpaceRoleMembers({
          space: spaceIdentifier("space-1"),
          role: spaceRoleIdentifier("role-admin"),
          members: [spaceMemberIdentifier(accountB)]
        }).pipe(Effect.provide(createTestLayer({
          spaces: [malformedMemberStorage],
          spaceTypes: [makeSpaceType({ roles: 2 })],
          roles: [
            makeRole(),
            makeRole({ _id: toRef<Role>("role-viewer"), name: "Viewers" })
          ],
          captureMixin: malformedMembersMixin
        })))
      )

      expect(unknownRoleError).toBeInstanceOf(SpaceRoleAssignmentsMalformedError)
      expect(unknownRoleError.message).toContain("unknown role assignment key")
      expect(unknownRoleMixin.action).toBeUndefined()
      expect(malformedMembersError).toBeInstanceOf(SpaceRoleAssignmentsMalformedError)
      expect(malformedMembersError.message).toContain("expected an object")
      expect(malformedMembersMixin.action).toBeUndefined()
    }))

  it.effect("space role member mutations resolve roles by id and by exact name scoped to the space type", () =>
    Effect.gen(function*() {
      const byIdMixin: MockConfig["captureMixin"] = {}
      const byNameMixin: MockConfig["captureMixin"] = {}
      const typedSpace = makeSpace({ type: toRef<SpaceType>("space-type-1") })
      const adminForSpaceType = makeRole()
      const adminForOtherSpaceType = makeRole({
        _id: toRef<Role>("role-admin-other"),
        attachedTo: toRef<SpaceType>("space-type-2")
      })
      const viewerForSpaceType = makeRole({ _id: toRef<Role>("role-viewer"), name: "Viewers" })

      const byId = yield* addSpaceRoleMembers({
        space: spaceIdentifier("space-1"),
        role: spaceRoleIdentifier("role-viewer"),
        members: [spaceMemberIdentifier(accountA)]
      }).pipe(Effect.provide(createTestLayer({
        spaces: [typedSpace],
        spaceTypes: [makeSpaceType({ roles: 2 })],
        roles: [adminForSpaceType, viewerForSpaceType],
        captureMixin: byIdMixin
      })))
      const byNameScopedToSpaceType = yield* addSpaceRoleMembers({
        space: spaceIdentifier("space-1"),
        role: spaceRoleIdentifier("Admins"),
        members: [spaceMemberIdentifier(accountA)]
      }).pipe(Effect.provide(createTestLayer({
        spaces: [typedSpace],
        spaceTypes: [makeSpaceType()],
        roles: [adminForOtherSpaceType, adminForSpaceType],
        captureMixin: byNameMixin
      })))

      expect(byId).toMatchObject({ roleId: "role-viewer", members: [accountA], changed: true })
      expect(byIdMixin).toMatchObject({ action: "create", attributes: { "role-viewer": [accountA] } })
      expect(byNameScopedToSpaceType).toMatchObject({ roleId: "role-admin", members: [accountA], changed: true })
      expect(byNameMixin).toMatchObject({ action: "create", attributes: { "role-admin": [accountA] } })
    }))

  it.effect("space role member mutations resolve members by account UUID, exact email, and display name", () =>
    Effect.gen(function*() {
      const captureMixin: MockConfig["captureMixin"] = {}
      const result = yield* setSpaceRoleMembers({
        space: spaceIdentifier("space-1"),
        role: spaceRoleIdentifier("Admins"),
        members: [
          spaceMemberIdentifier(accountA),
          spaceMemberIdentifier("jane@example.com"),
          spaceMemberIdentifier("Doe,Jane")
        ]
      }).pipe(Effect.provide(createTestLayer({
        spaces: [makeSpace({ type: toRef<SpaceType>("space-type-1") })],
        spaceTypes: [makeSpaceType()],
        roles: [makeRole()],
        persons: [makePerson()],
        channels: [makeChannel()],
        employees: [makeEmployee()],
        captureMixin
      })))

      expect(result).toMatchObject({ roleId: "role-admin", members: [accountA, accountB], changed: true })
      expect(captureMixin).toMatchObject({
        action: "create",
        attributes: { "role-admin": [accountA, accountB] }
      })
    }))

  it.effect("space role add and remove mutations are idempotent", () =>
    Effect.gen(function*() {
      const addMixin: MockConfig["captureMixin"] = {}
      const createMixin: MockConfig["captureMixin"] = {}
      const removeMixin: MockConfig["captureMixin"] = {}
      const baseSpace = makeSpace({
        type: toRef<SpaceType>("space-type-1"),
        [core.class.Space]: {
          "role-admin": [accountA]
        }
      })

      const added = yield* addSpaceRoleMembers({
        space: spaceIdentifier("space-1"),
        role: spaceRoleIdentifier("role-admin"),
        members: [spaceMemberIdentifier(accountB), spaceMemberIdentifier(accountA)]
      }).pipe(Effect.provide(createTestLayer({
        spaces: [baseSpace],
        spaceTypes: [makeSpaceType()],
        roles: [makeRole()],
        captureMixin: addMixin
      })))
      const created = yield* addSpaceRoleMembers({
        space: spaceIdentifier("space-1"),
        role: spaceRoleIdentifier("role-admin"),
        members: [spaceMemberIdentifier(accountA)]
      }).pipe(Effect.provide(createTestLayer({
        spaces: [makeSpace({ type: toRef<SpaceType>("space-type-1") })],
        spaceTypes: [makeSpaceType()],
        roles: [makeRole()],
        captureMixin: createMixin
      })))
      const addNoop = yield* addSpaceRoleMembers({
        space: spaceIdentifier("space-1"),
        role: spaceRoleIdentifier("role-admin"),
        members: [spaceMemberIdentifier(accountA)]
      }).pipe(Effect.provide(createTestLayer({
        spaces: [baseSpace],
        spaceTypes: [makeSpaceType()],
        roles: [makeRole()]
      })))
      const removed = yield* removeSpaceRoleMembers({
        space: spaceIdentifier("space-1"),
        role: spaceRoleIdentifier("role-admin"),
        members: [spaceMemberIdentifier(accountA)]
      }).pipe(
        Effect.provide(createTestLayer({
          spaces: [baseSpace],
          spaceTypes: [makeSpaceType()],
          roles: [makeRole()],
          captureMixin: removeMixin
        }))
      )
      const removeNoop = yield* removeSpaceRoleMembers({
        space: spaceIdentifier("space-1"),
        role: spaceRoleIdentifier("role-admin"),
        members: [spaceMemberIdentifier(accountC)]
      }).pipe(Effect.provide(createTestLayer({
        spaces: [baseSpace],
        spaceTypes: [makeSpaceType()],
        roles: [makeRole()]
      })))

      expect(added.members).toEqual([accountA, accountB])
      expect(addMixin).toMatchObject({ action: "update", attributes: { "role-admin": [accountA, accountB] } })
      expect(created.changed).toBe(true)
      expect(createMixin).toMatchObject({ action: "create", attributes: { "role-admin": [accountA] } })
      expect(addNoop.changed).toBe(false)
      expect(removed.members).toEqual([])
      expect(removeMixin).toMatchObject({ action: "update", attributes: { "role-admin": [] } })
      expect(removeNoop.changed).toBe(false)
    }))

  it.effect("space role member mutations reject non-typed spaces and missing or ambiguous roles with typed errors", () =>
    Effect.gen(function*() {
      const nonTyped = yield* Effect.flip(
        setSpaceRoleMembers({
          space: spaceIdentifier("space-1"),
          role: spaceRoleIdentifier("Admins"),
          members: []
        }).pipe(Effect.provide(createTestLayer({ spaces: [makeSpace()], roles: [makeRole()] })))
      )
      const missingRole = yield* Effect.flip(
        addSpaceRoleMembers({
          space: spaceIdentifier("space-1"),
          role: spaceRoleIdentifier("Missing"),
          members: [spaceMemberIdentifier(accountA)]
        }).pipe(Effect.provide(createTestLayer({
          spaces: [makeSpace({ type: toRef<SpaceType>("space-type-1") })],
          spaceTypes: [makeSpaceType()],
          roles: [makeRole()]
        })))
      )
      const missingSpaceType = yield* Effect.flip(
        addSpaceRoleMembers({
          space: spaceIdentifier("space-1"),
          role: spaceRoleIdentifier("Admins"),
          members: [spaceMemberIdentifier(accountA)]
        }).pipe(Effect.provide(createTestLayer({
          spaces: [makeSpace({ type: toRef<SpaceType>("space-type-1") })],
          roles: [makeRole()]
        })))
      )
      const ambiguousRole = yield* Effect.flip(
        addSpaceRoleMembers({
          space: spaceIdentifier("space-1"),
          role: spaceRoleIdentifier("Admins"),
          members: [spaceMemberIdentifier(accountA)]
        }).pipe(Effect.provide(createTestLayer({
          spaces: [makeSpace({ type: toRef<SpaceType>("space-type-1") })],
          spaceTypes: [makeSpaceType()],
          roles: [
            makeRole({ _id: toRef<Role>("role-admin-a") }),
            makeRole({ _id: toRef<Role>("role-admin-b") })
          ]
        })))
      )

      expect(nonTyped).toBeInstanceOf(SpaceNotTypedError)
      expect(nonTyped._tag).toBe("SpaceNotTypedError")
      expect(missingRole).toBeInstanceOf(SpaceRoleNotFoundError)
      expect(missingRole._tag).toBe("SpaceRoleNotFoundError")
      expect(missingSpaceType).toBeInstanceOf(SpaceRoleNotFoundError)
      expect(missingSpaceType._tag).toBe("SpaceRoleNotFoundError")
      expect(ambiguousRole).toBeInstanceOf(SpaceRoleIdentifierAmbiguousError)
      expect(ambiguousRole._tag).toBe("SpaceRoleIdentifierAmbiguousError")
    }))

  it.effect("space role resolution is not truncated by broad role list caps", () =>
    Effect.gen(function*() {
      const fillerRoles = Array.from({ length: 100 }, (_, index) =>
        makeRole({
          _id: toRef<Role>(`role-filler-${index}`),
          name: `Filler ${index}`
        }))
      const lateRole = makeRole({ _id: toRef<Role>("role-late"), name: "Late Role" })
      const lateDuplicateA = makeRole({ _id: toRef<Role>("role-late-a"), name: "Duplicated Late Role" })
      const lateDuplicateB = makeRole({ _id: toRef<Role>("role-late-b"), name: "Duplicated Late Role" })
      const baseLayer = {
        spaces: [makeSpace({ type: toRef<SpaceType>("space-type-1") })],
        spaceTypes: [makeSpaceType()]
      }

      const resolved = yield* addSpaceRoleMembers({
        space: spaceIdentifier("space-1"),
        role: spaceRoleIdentifier("Late Role"),
        members: [spaceMemberIdentifier(accountA)]
      }).pipe(Effect.provide(createTestLayer({
        ...baseLayer,
        roles: [...fillerRoles, lateRole]
      })))
      const ambiguous = yield* Effect.exit(
        addSpaceRoleMembers({
          space: spaceIdentifier("space-1"),
          role: spaceRoleIdentifier("Duplicated Late Role"),
          members: [spaceMemberIdentifier(accountA)]
        }).pipe(Effect.provide(createTestLayer({
          ...baseLayer,
          roles: [...fillerRoles, lateDuplicateA, lateDuplicateB]
        })))
      )

      expect(resolved).toMatchObject({ roleId: "role-late", members: [accountA], changed: true })
      expect(exitCauseText(ambiguous)).toContain("SpaceRoleIdentifierAmbiguousError")
      expect(exitCauseText(ambiguous)).toContain("role-late-b")
    }))

  it.effect("member resolution reports missing, ambiguous, and non-employee persons", () =>
    Effect.gen(function*() {
      const missing = yield* Effect.exit(
        addSpaceMembers({
          space: spaceIdentifier("space-1"),
          members: [spaceMemberIdentifier("missing@example.com")]
        }).pipe(Effect.provide(createTestLayer({ spaces: [makeSpace()] })))
      )
      const ambiguous = yield* Effect.exit(
        addSpaceMembers({
          space: spaceIdentifier("space-1"),
          members: [spaceMemberIdentifier("Doe,Jane")]
        }).pipe(Effect.provide(createTestLayer({
          spaces: [makeSpace()],
          persons: [
            makePerson({ _id: toRef<Person>("person-1") }),
            makePerson({ _id: toRef<Person>("person-2") })
          ]
        })))
      )
      const nonEmployee = yield* Effect.exit(
        addSpaceMembers({
          space: spaceIdentifier("space-1"),
          members: [spaceMemberIdentifier("Doe,Jane")]
        }).pipe(Effect.provide(createTestLayer({ spaces: [makeSpace()], persons: [makePerson()] })))
      )

      expect(exitCauseText(missing)).toContain("PersonNotFoundError")
      expect(exitCauseText(ambiguous)).toContain("PersonIdentifierAmbiguousError")
      expect(exitCauseText(nonEmployee)).toContain("PersonNotAnEmployeeError")
    }))
})
