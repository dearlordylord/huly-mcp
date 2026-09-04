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

const loadPersonAdministrationData = (
  client: HulyClient["Service"],
  workspace: WorkspaceClientOperations,
  person: Person
): Effect.Effect<PersonAdministrationData, HulyClientError | HulyDataInvalidError> =>
  Effect.gen(function* () {
    const [identityDtos, statuses, channels, employee, memberDtos] = yield* Effect.all([
      client.findAll<SocialIdentity>(
        contact.class.SocialIdentity,
        hulyQuery<SocialIdentity>({ attachedTo: person._id })
      ),
      client.findAll<Status>(contact.class.Status, hulyQuery<Status>({ attachedTo: toRef<Employee>(person._id) })),
      client.findAll<Channel>(contact.class.Channel, hulyQuery<Channel>({ attachedTo: person._id })),
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

const readResolvedPersonAdministration = (
  client: HulyClient["Service"],
  workspace: WorkspaceClientOperations,
  person: Person
): Effect.Effect<GetPersonAdministrationResult, PersonAdministrationReadError> =>
  loadPersonAdministrationData(client, workspace, person).pipe(
    Effect.flatMap((data) => {
      const personUuid = data.employee?.personUuid ?? data.person.personUuid
      return loadProfile(workspace, personUuid).pipe(
        Effect.flatMap((profile) =>
          decodePersonAdministrationResult(makePersonAdministrationProjection({ ...data, profile }))
        )
      )
    })
  )

export const getPersonAdministration = (
  params: GetPersonAdministrationParams
): Effect.Effect<GetPersonAdministrationResult, PersonAdministrationReadError, HulyClient | WorkspaceClient> =>
  Effect.all([HulyClient, WorkspaceClient]).pipe(
    Effect.flatMap(([client, workspace]) =>
      resolvePersonAdministrationTarget(client, params.person).pipe(
        Effect.flatMap((person) => readResolvedPersonAdministration(client, workspace, person))
      )
    )
  )
