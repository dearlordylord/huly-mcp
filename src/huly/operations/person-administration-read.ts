import type { Channel, Employee, Person, SocialIdentity, Status } from "@hcengineering/contact"
import { Effect, Schema } from "effect"

import type {
  GetPersonAdministrationParams,
  GetPersonAdministrationResult
} from "../../domain/schemas/person-administration.js"
import { GetPersonAdministrationResultSchema } from "../../domain/schemas/person-administration.js"
import type { PersonUuid } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { PersonIdentifierAmbiguousError, PersonNotFoundError } from "../errors.js"
import { HulyDataInvalidError } from "../errors.js"
import { contact } from "../huly-plugins.js"
import { WorkspaceClient, type WorkspaceClientOperations } from "../workspace-client.js"
import { hulyQuery } from "./query-helpers.js"
import { toAccountUuid, toRef } from "./sdk-boundary.js"
import {
  type AccountProfile,
  decodeAccountProfile,
  decodeWorkspaceMembers,
  decodeWorkspacePersonAdministrationProjectionData,
  decodeWorkspaceSocialIdentitiesForRead,
  type WorkspacePersonAdministrationProjectionData,
  type WorkspaceMemberInfo,
  type ResolvedPerson,
  type WorkspaceSocialIdentity
} from "./person-administration-boundaries.js"
import { resolvePersonAdministrationTarget } from "./person-administration-shared.js"
import { makePersonAdministrationProjection } from "./person-administration-projection.js"

type PersonAdministrationReadError =
  | HulyClientError
  | HulyDataInvalidError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError

const decodePersonAdministrationResult = (
  input: unknown
): Effect.Effect<GetPersonAdministrationResult, HulyDataInvalidError> =>
  Schema.decodeUnknownEffect(GetPersonAdministrationResultSchema)(input).pipe(
    Effect.mapError(
      (cause) => new HulyDataInvalidError({ operation: "getPersonAdministration", entity: "person", cause })
    )
  )

const loadProfile = (
  workspace: WorkspaceClientOperations,
  personUuid: PersonUuid | undefined
): Effect.Effect<AccountProfile | null, HulyClientError | HulyDataInvalidError> =>
  personUuid === undefined
    ? Effect.succeed(null)
    : workspace.getUserProfile(toAccountUuid(personUuid)).pipe(Effect.flatMap(decodeAccountProfile))

interface PersonAdministrationData extends WorkspacePersonAdministrationProjectionData {
  readonly identities: ReadonlyArray<WorkspaceSocialIdentity>
  readonly members: ReadonlyArray<WorkspaceMemberInfo>
}

const loadPersonAdministrationData = Effect.fn("PersonAdministration.loadReadData")(function* (
  client: HulyClient["Service"],
  workspace: WorkspaceClientOperations,
  person: ResolvedPerson
): Effect.fn.Return<PersonAdministrationData, HulyClientError | HulyDataInvalidError> {
  const [identityDtos, statuses, channels, employee, memberDtos] = yield* Effect.all([
    client.findAll<SocialIdentity>(
      contact.class.SocialIdentity,
      hulyQuery<SocialIdentity>({ attachedTo: toRef<Person>(person._id) })
    ),
    client.findAll<Status>(contact.class.Status, hulyQuery<Status>({ attachedTo: toRef<Employee>(person._id) })),
    client.findAll<Channel>(contact.class.Channel, hulyQuery<Channel>({ attachedTo: toRef<Person>(person._id) })),
    client.findOne<Employee>(contact.mixin.Employee, hulyQuery<Employee>({ _id: toRef<Employee>(person._id) })),
    workspace.getWorkspaceMembers()
  ])
  const identities = yield* decodeWorkspaceSocialIdentitiesForRead(identityDtos)
  const members = yield* decodeWorkspaceMembers(memberDtos)
  const projectionData = yield* decodeWorkspacePersonAdministrationProjectionData({
    person,
    statuses,
    channels,
    ...(employee === undefined ? {} : { employee })
  })
  return { ...projectionData, identities, members }
})

const readResolvedPersonAdministration = Effect.fn("PersonAdministration.readResolved")(function* (
  client: HulyClient["Service"],
  workspace: WorkspaceClientOperations,
  person: ResolvedPerson
): Effect.fn.Return<GetPersonAdministrationResult, PersonAdministrationReadError> {
  const data = yield* loadPersonAdministrationData(client, workspace, person)
  const personUuid = data.employee?.personUuid ?? data.person.personUuid
  const profile = yield* loadProfile(workspace, personUuid)
  return yield* decodePersonAdministrationResult(makePersonAdministrationProjection({ ...data, profile }))
})

export const getPersonAdministration = Effect.fn("PersonAdministration.get")(function* (
  params: GetPersonAdministrationParams
): Effect.fn.Return<GetPersonAdministrationResult, PersonAdministrationReadError, HulyClient | WorkspaceClient> {
  const client = yield* HulyClient
  const workspace = yield* WorkspaceClient
  const person = yield* resolvePersonAdministrationTarget(client, params.person)
  return yield* readResolvedPersonAdministration(client, workspace, person)
})
