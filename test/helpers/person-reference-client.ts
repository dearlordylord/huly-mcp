import {
  ClassifierKind,
  type Class,
  type Client,
  type Doc,
  type DocumentQuery,
  type FindOptions,
  Hierarchy,
  ModelDb,
  type Ref,
  type Tx,
  TxOperations
} from "@hcengineering/core"

import { contact, core, tracker } from "../../src/huly/huly-plugins.js"
import { type DocId, NonEmptyString, ObjectClassName, PersonId } from "../../src/domain/schemas/shared.js"
import { corePersonId, sdkFixture } from "./huly-sdk.js"

export const githubIssueMixin = ObjectClassName.make("github:mixin:GithubIssue")
export const reviewerMixin = ObjectClassName.make("test:mixin:Reviewer")
export const sourcePerson = PersonId.make("source-person")
export const survivorPerson = PersonId.make("survivor-person")

type FixtureClass = ObjectClassName | Ref<Class<Doc>>
type FixtureDomain = "fixture" | "model"

export const makePersonReferenceClient = () => {
  const hierarchy = new Hierarchy()
  const model = new ModelDb(hierarchy)
  const storage = new ModelDb(hierarchy)
  const writes: Array<Tx> = []
  const addClass = (
    id: FixtureClass,
    parent: FixtureClass | undefined,
    kind = ClassifierKind.CLASS,
    domain: FixtureDomain = "fixture"
  ) => {
    hierarchy.tx(
      sdkFixture<Tx>({
        _id: `create-${id}`,
        _class: core.class.TxCreateDoc,
        objectClass: kind === ClassifierKind.MIXIN ? core.class.Mixin : core.class.Class,
        objectId: id,
        objectSpace: core.space.Model,
        modifiedOn: 0,
        modifiedBy: "fixture-user",
        attributes: { kind, domain, ...(parent === undefined ? {} : { extends: parent }) }
      })
    )
  }
  addClass(core.class.Doc, undefined)
  addClass(core.class.Class, core.class.Doc, ClassifierKind.CLASS, "model")
  addClass(core.class.Mixin, core.class.Class, ClassifierKind.CLASS, "model")
  addClass(core.class.Attribute, core.class.Doc, ClassifierKind.CLASS, "model")
  addClass(core.class.RefTo, core.class.Doc)
  addClass(core.class.ArrOf, core.class.Doc)
  addClass(core.class.AttachedDoc, core.class.Doc)
  addClass(contact.class.Person, core.class.Doc)
  addClass(tracker.class.Issue, core.class.Doc)
  addClass(githubIssueMixin, tracker.class.Issue, ClassifierKind.MIXIN)
  addClass(reviewerMixin, tracker.class.Issue, ClassifierKind.MIXIN)

  const addReference = (owner: FixtureClass, name: NonEmptyString, array = false) => {
    const refType = { _class: core.class.RefTo, to: contact.class.Person }
    const attribute = sdkFixture<Doc>({
      _id: `${owner}_${name}`,
      _class: core.class.Attribute,
      space: core.space.Model,
      modifiedOn: 0,
      modifiedBy: "fixture-user",
      attributeOf: owner,
      name,
      type: array ? { _class: core.class.ArrOf, of: refType } : refType
    })
    hierarchy.tx(
      sdkFixture<Tx>({
        _id: `create-${attribute._id}`,
        _class: core.class.TxCreateDoc,
        objectClass: core.class.Attribute,
        objectId: attribute._id,
        objectSpace: core.space.Model,
        modifiedOn: 0,
        modifiedBy: "fixture-user",
        attributes: { attributeOf: owner, name, type: Reflect.get(attribute, "type") }
      })
    )
    model.addDoc(attribute)
  }
  addReference(tracker.class.Issue, NonEmptyString.make("assignee"))

  const addIssue = (id: DocId, fields: Readonly<Record<string, unknown>>) => {
    storage.addDoc(
      sdkFixture<Doc>({
        _id: id,
        _class: tracker.class.Issue,
        space: "fixture-space",
        modifiedOn: 0,
        modifiedBy: "fixture-user",
        ...fields
      })
    )
  }
  const client = new TxOperations(
    sdkFixture<Client>({
      getHierarchy: () => hierarchy,
      getModel: () => model,
      // The server resolves a mixin _class constraint to its stored base class;
      // ModelDb alone treats that constraint as a literal string comparison.
      findAll: (cls: Ref<Class<Doc>>, query: DocumentQuery<Doc>, options?: FindOptions<Doc>) =>
        storage.findAll(
          cls,
          hierarchy.isMixin(cls) ? { ...query, _class: hierarchy.getBaseClass(cls) } : query,
          options
        ),
      findOne: storage.findOne.bind(storage),
      tx: (tx: Tx) => {
        writes.push(tx)
        return storage.tx(tx)
      }
    }),
    corePersonId("fixture-user")
  )
  return { client, storage, writes, addIssue, addReference }
}
