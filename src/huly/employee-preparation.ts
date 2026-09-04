import { type Channel, type Employee, type Person, type SocialIdentity, AvatarType } from "@hcengineering/contact"
import { buildSocialIdString, SocialIdType, type TxOperations } from "@hcengineering/core"

import type { EmployeeInvitationRole } from "../domain/schemas/employee-lifecycle.js"
import type { SocialIdentityId } from "../domain/schemas/person-administration.js"
import type {
  Email,
  HulyConditionalWriteResult,
  HulyTransactionScope,
  PersonId,
  PersonName
} from "../domain/schemas/shared.js"
import { contact } from "./huly-plugins.js"
import { hulyQuery } from "./operations/query-helpers.js"
import { toRef, toSocialIdentityRef } from "./operations/sdk-boundary.js"

export type ExistingEmployeePreparation =
  | { readonly state: "create" }
  | { readonly state: "update"; readonly previousActive: boolean; readonly previousRole?: EmployeeInvitationRole }

export type ExistingIdentityPreparation =
  | { readonly state: "create"; readonly identityId: SocialIdentityId }
  | { readonly state: "existing"; readonly identityId: SocialIdentityId }

interface EmployeePreparationBase {
  readonly name: PersonName
  readonly email: Email
  readonly targetRole: EmployeeInvitationRole
  readonly scope: HulyTransactionScope
}

export type EmployeePreparationPlan =
  | (EmployeePreparationBase & {
      readonly kind: "create-person"
      readonly personId: PersonId
      readonly identityId: SocialIdentityId
    })
  | (EmployeePreparationBase & {
      readonly kind: "prepare-existing"
      readonly personId: PersonId
      readonly previousName: PersonName
      readonly identity: ExistingIdentityPreparation
      readonly employee: ExistingEmployeePreparation
    })
  | (EmployeePreparationBase & {
      readonly kind: "reconcile-role"
      readonly personId: PersonId
      readonly previousName: PersonName
      readonly employee: Extract<ExistingEmployeePreparation, { readonly state: "update" }>
    })

type ExistingPlan = Extract<EmployeePreparationPlan, { readonly kind: "prepare-existing" | "reconcile-role" }>

const addExistingPersonConditions = (apply: ReturnType<TxOperations["apply"]>, preparation: ExistingPlan): void => {
  const personId = toRef<Person>(preparation.personId)
  apply.match(contact.class.Person, hulyQuery<Person>({ _id: personId, name: preparation.previousName }))
  apply.notMatch(contact.class.Person, hulyQuery<Person>({ _id: { $ne: personId }, name: preparation.name }))
}

const addEmailIdentity = async (
  apply: ReturnType<TxOperations["apply"]>,
  personId: PersonId,
  identityId: SocialIdentityId,
  email: Email
): Promise<void> => {
  await apply.addCollection(
    contact.class.SocialIdentity,
    contact.space.Contacts,
    toRef<Person>(personId),
    contact.class.Person,
    "socialIds",
    {
      type: SocialIdType.EMAIL,
      value: email,
      key: buildSocialIdString({ type: SocialIdType.EMAIL, value: email }),
      isDeleted: false
    },
    toSocialIdentityRef(identityId)
  )
}

const addIdentityPreparation = async (
  apply: ReturnType<TxOperations["apply"]>,
  preparation: Extract<EmployeePreparationPlan, { readonly kind: "prepare-existing" }>
): Promise<void> => {
  const personId = toRef<Person>(preparation.personId)
  const identityId = toSocialIdentityRef(preparation.identity.identityId)
  if (preparation.identity.state === "existing") {
    apply.match(
      contact.class.SocialIdentity,
      hulyQuery<SocialIdentity>({
        _id: identityId,
        attachedTo: personId,
        type: SocialIdType.EMAIL,
        value: preparation.email,
        isDeleted: false
      })
    )
    apply.notMatch(
      contact.class.SocialIdentity,
      hulyQuery<SocialIdentity>({ _id: { $ne: identityId }, type: SocialIdType.EMAIL, value: preparation.email })
    )
    apply.notMatch(
      contact.class.Channel,
      hulyQuery<Channel>({
        provider: contact.channelProvider.Email,
        value: preparation.email,
        attachedTo: { $ne: personId }
      })
    )
    return
  }
  apply.notMatch(contact.class.SocialIdentity, hulyQuery<SocialIdentity>({ _id: identityId }))
  apply.notMatch(
    contact.class.SocialIdentity,
    hulyQuery<SocialIdentity>({ type: SocialIdType.EMAIL, value: preparation.email })
  )
  apply.notMatch(
    contact.class.Channel,
    hulyQuery<Channel>({
      provider: contact.channelProvider.Email,
      value: preparation.email,
      attachedTo: { $ne: personId }
    })
  )
  await addEmailIdentity(apply, preparation.personId, preparation.identity.identityId, preparation.email)
}

const addEmployeePreparation = async (
  apply: ReturnType<TxOperations["apply"]>,
  preparation: ExistingPlan
): Promise<void> => {
  const personId = toRef<Person>(preparation.personId)
  const targetActive = preparation.kind === "prepare-existing"
  if (preparation.employee.state === "create") {
    apply.notMatch(contact.mixin.Employee, hulyQuery<Employee>({ _id: toRef<Employee>(preparation.personId) }))
    await apply.createMixin(personId, contact.class.Person, contact.space.Contacts, contact.mixin.Employee, {
      active: targetActive,
      role: preparation.targetRole
    })
    return
  }
  apply.match(
    contact.mixin.Employee,
    hulyQuery<Employee>({
      _id: toRef<Employee>(preparation.personId),
      active: preparation.employee.previousActive,
      role: preparation.employee.previousRole === undefined ? { $exists: false } : preparation.employee.previousRole
    })
  )
  await apply.updateMixin(personId, contact.class.Person, contact.space.Contacts, contact.mixin.Employee, {
    active: targetActive,
    role: preparation.targetRole
  })
}

export const executeEmployeePreparation = async (
  client: TxOperations,
  preparation: EmployeePreparationPlan
): Promise<HulyConditionalWriteResult> => {
  const apply = client.apply(preparation.scope)
  if (preparation.kind === "create-person") {
    const personId = toRef<Person>(preparation.personId)
    const identityId = toSocialIdentityRef(preparation.identityId)
    apply.notMatch(contact.class.Person, hulyQuery<Person>({ _id: personId }))
    apply.notMatch(contact.class.Person, hulyQuery<Person>({ name: preparation.name }))
    apply.notMatch(contact.class.SocialIdentity, hulyQuery<SocialIdentity>({ _id: identityId }))
    apply.notMatch(
      contact.class.SocialIdentity,
      hulyQuery<SocialIdentity>({ type: SocialIdType.EMAIL, value: preparation.email })
    )
    apply.notMatch(
      contact.class.Channel,
      hulyQuery<Channel>({ provider: contact.channelProvider.Email, value: preparation.email })
    )
    apply.notMatch(contact.mixin.Employee, hulyQuery<Employee>({ _id: toRef<Employee>(preparation.personId) }))
    await apply.createDoc(
      contact.class.Person,
      contact.space.Contacts,
      { name: preparation.name, city: "", avatarType: AvatarType.COLOR },
      personId
    )
    await addEmailIdentity(apply, preparation.personId, preparation.identityId, preparation.email)
    await apply.createMixin(personId, contact.class.Person, contact.space.Contacts, contact.mixin.Employee, {
      active: true,
      role: preparation.targetRole
    })
  } else {
    addExistingPersonConditions(apply, preparation)
    if (preparation.kind === "prepare-existing") {
      if (preparation.previousName !== preparation.name) {
        await apply.updateDoc(contact.class.Person, contact.space.Contacts, toRef<Person>(preparation.personId), {
          name: preparation.name
        })
      }
      await addIdentityPreparation(apply, preparation)
    }
    await addEmployeePreparation(apply, preparation)
  }
  return (await apply.commit()).result ? "applied" : "condition-not-met"
}
