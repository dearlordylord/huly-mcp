import type { Project as HulyProject } from "@hcengineering/tracker"

import { type MarkupFormat, type MarkupRef } from "@hcengineering/api-client"
import {
  type AccountUuid,
  type AttachedData,
  type AttachedDoc,
  type Class,
  type Data,
  type Doc,
  type DocumentQuery,
  type DocumentUpdate,
  type FindOptions,
  type FindResult,
  type Mixin,
  type MixinData,
  type MixinUpdate,
  type PersonId,
  type Ref,
  type SearchOptions,
  type SearchQuery,
  type SearchResult,
  type Space,
  type TxResult,
  type WithLookup
} from "@hcengineering/core"
import type { Effect } from "effect"

import { type PersonAdministrationLocator } from "../domain/schemas/person-administration.js"
import type { PersonMergeReferenceImpact } from "../domain/schemas/person-merge.js"
import {
  type IssueId,
  type DocId,
  type HulyConditionalWriteResult,
  type HulyTransactionScope,
  type PersonId as DomainPersonId
} from "../domain/schemas/shared.js"

import { type HulyDataInvalidError } from "./errors-base.js"
import type { PersonMergeSnapshotStaleError } from "./errors-person-administration.js"
import { type EmployeePreparationPlan } from "./employee-preparation.js"

import { type MarkupUrlConfig } from "./operations/markup.js"
import type { ResolvedPerson } from "./operations/person-administration-boundaries.js"
import { type ResolvePersonAdministrationError } from "./operations/person-administration-shared.js"

import { type WorkbenchUrlConfig } from "./url-builders.js"
import type { TransferTreeWrite } from "../domain/schemas/issue-transfer-tree.js"
import type { MovementIssue } from "../domain/schemas/issue-movement-state.js"

import { type MovementWriteError } from "./movement-write-client.js"
import type {
  MovementTransactionInspection,
  MovementTransactionProgress,
  MovementTransactions
} from "./issue-movement-transactions.js"
import type { TransferForestInspection, TransferForestProgress } from "./issue-transfer-forest-state.js"
import type { TransferInspection, TransferWrite } from "../domain/schemas/issue-transfer.js"
import type { ConnectionError } from "./client-connection.js"
import type { HulyInitializationStatus } from "../runtime/client-initialization.js"
export type HulyClientError = ConnectionError

interface HulyClientContext {
  readonly markupUrlConfig: MarkupUrlConfig
  readonly workbenchUrlConfig: WorkbenchUrlConfig
}

export interface HulyClientOperations extends HulyClientContext {
  readonly initializationStatus?: Effect.Effect<HulyInitializationStatus>
  readonly findProjectDocuments?: (
    query: DocumentQuery<HulyProject>,
    options?: FindOptions<HulyProject>
  ) => Effect.Effect<FindResult<HulyProject>, HulyClientError>

  readonly inspectTransferForest?: (
    roots: ReadonlyArray<IssueId>,
    tree?: ReadonlyArray<MovementIssue>,
    publish?: TransferForestProgress
  ) => Effect.Effect<TransferForestInspection, HulyClientError | HulyDataInvalidError>
  readonly inspectTransferRecords?: (
    issueId: IssueId,
    tree?: ReadonlyArray<MovementIssue>
  ) => Effect.Effect<TransferInspection, HulyClientError | HulyDataInvalidError>
  readonly inspectMovementTransactions?: (
    queued: MovementTransactions
  ) => Effect.Effect<MovementTransactionInspection, HulyClientError | HulyDataInvalidError>
  readonly commitTransferTree?: (
    write: TransferTreeWrite,
    publishTransactions?: MovementTransactionProgress
  ) => Effect.Effect<HulyConditionalWriteResult, MovementWriteError>
  readonly commitTransfer?: (write: TransferWrite) => Effect.Effect<HulyConditionalWriteResult, MovementWriteError>
  readonly allocateMovementNumber?: (destinationId: DocId) => Effect.Effect<TxResult, MovementWriteError>
  readonly getAccountUuid: () => AccountUuid
  readonly getPrimarySocialId: () => PersonId
  readonly getSocialIds?: () => ReadonlyArray<PersonId>

  readonly findAll: <T extends Doc>(
    _class: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ) => Effect.Effect<FindResult<T>, HulyClientError>

  readonly findOne: <T extends Doc>(
    _class: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ) => Effect.Effect<WithLookup<T> | undefined, HulyClientError>

  /**
   * Query documents from the client-side model instead of the server.
   * Model-space documents are loaded at connection time, so this can still
   * resolve metadata when a server-side model document query fails.
   */
  readonly findAllInModel: <T extends Doc>(
    _class: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ) => Effect.Effect<FindResult<T>, HulyClientError>

  readonly createDoc: <T extends Doc>(
    _class: Ref<Class<T>>,
    space: Ref<Space>,
    attributes: Data<T>,
    id?: Ref<T>
  ) => Effect.Effect<Ref<T>, HulyClientError>

  readonly createDocIfNotMatched?: <T extends Doc, M extends Doc>(
    _class: Ref<Class<T>>,
    space: Ref<Space>,
    attributes: Data<T>,
    id: Ref<T>,
    matchClass: Ref<Class<M>>,
    matchQuery: DocumentQuery<M>,
    scope: HulyTransactionScope
  ) => Effect.Effect<HulyConditionalWriteResult, HulyClientError>

  readonly updateDoc: <T extends Doc>(
    _class: Ref<Class<T>>,
    space: Ref<Space>,
    objectId: Ref<T>,
    operations: DocumentUpdate<T>,
    retrieve?: boolean
  ) => Effect.Effect<TxResult, HulyClientError>

  readonly updateDocIfMatched?: <T extends Doc>(
    _class: Ref<Class<T>>,
    space: Ref<Space>,
    objectId: Ref<T>,
    matchQuery: DocumentQuery<T>,
    operations: DocumentUpdate<T>,
    scope: HulyTransactionScope
  ) => Effect.Effect<HulyConditionalWriteResult, HulyClientError>

  readonly updateCollection?: <T extends Doc, P extends AttachedDoc>(
    _class: Ref<Class<P>>,
    space: Ref<Space>,
    objectId: Ref<P>,
    attachedTo: Ref<T>,
    attachedToClass: Ref<Class<T>>,
    collection: Extract<keyof T, string> | string,
    operations: DocumentUpdate<P>,
    retrieve?: boolean
  ) => Effect.Effect<Ref<T>, HulyClientError>

  readonly addCollection: <T extends Doc, P extends AttachedDoc>(
    _class: Ref<Class<P>>,
    space: Ref<Space>,
    attachedTo: Ref<T>,
    attachedToClass: Ref<Class<T>>,
    collection: string,
    attributes: AttachedData<P>,
    id?: Ref<P>
  ) => Effect.Effect<Ref<P>, HulyClientError>

  readonly removeCollection?: <T extends Doc, P extends AttachedDoc>(
    _class: Ref<Class<P>>,
    space: Ref<Space>,
    objectId: Ref<P>,
    attachedTo: Ref<T>,
    attachedToClass: Ref<Class<T>>,
    collection: Extract<keyof T, string> | string
  ) => Effect.Effect<Ref<T>, HulyClientError>

  readonly removeDoc: <T extends Doc>(
    _class: Ref<Class<T>>,
    space: Ref<Space>,
    objectId: Ref<T>
  ) => Effect.Effect<TxResult, HulyClientError>

  readonly removeDocIfMatched?: <T extends Doc>(
    _class: Ref<Class<T>>,
    space: Ref<Space>,
    objectId: Ref<T>,
    matchQuery: DocumentQuery<T>,
    scope: HulyTransactionScope
  ) => Effect.Effect<HulyConditionalWriteResult, HulyClientError>

  readonly uploadMarkup: (
    objectClass: Ref<Class<Doc>>,
    objectId: Ref<Doc>,
    objectAttr: string,
    markup: string,
    format: MarkupFormat
  ) => Effect.Effect<MarkupRef, HulyClientError>

  readonly fetchMarkup: (
    objectClass: Ref<Class<Doc>>,
    objectId: Ref<Doc>,
    objectAttr: string,
    id: MarkupRef,
    format: MarkupFormat
  ) => Effect.Effect<string, HulyClientError>

  readonly updateMarkup: (
    objectClass: Ref<Class<Doc>>,
    objectId: Ref<Doc>,
    objectAttr: string,
    markup: string,
    format: MarkupFormat
  ) => Effect.Effect<void, HulyClientError>

  readonly createMixin: <D extends Doc, M extends D>(
    objectId: Ref<D>,
    objectClass: Ref<Class<D>>,
    objectSpace: Ref<Space>,
    mixin: Ref<Mixin<M>>,
    attributes: MixinData<D, M>
  ) => Effect.Effect<TxResult, HulyClientError>

  /** Commit a checked Person, email identity, and Employee preparation as one Apply transaction. */
  readonly commitEmployeePreparation?: (
    preparation: EmployeePreparationPlan
  ) => Effect.Effect<HulyConditionalWriteResult, HulyClientError>

  readonly updateMixin: <D extends Doc, M extends D>(
    objectId: Ref<D>,
    objectClass: Ref<Class<D>>,
    objectSpace: Ref<Space>,
    mixin: Ref<Mixin<M>>,
    attributes: MixinUpdate<D, M>
  ) => Effect.Effect<TxResult, HulyClientError>

  readonly searchFulltext: (query: SearchQuery, options: SearchOptions) => Effect.Effect<SearchResult, HulyClientError>

  readonly resolvePersonAdministrationTarget?: (
    locator: PersonAdministrationLocator
  ) => Effect.Effect<ResolvedPerson, ResolvePersonAdministrationError>

  readonly inspectPersonReferences?: (
    source: DomainPersonId
  ) => Effect.Effect<ReadonlyArray<PersonMergeReferenceImpact>, HulyClientError | HulyDataInvalidError>

  readonly migratePersonReferences?: (
    impacts: ReadonlyArray<PersonMergeReferenceImpact>,
    source: DomainPersonId,
    survivor: DomainPersonId
  ) => Effect.Effect<void, HulyClientError | HulyDataInvalidError | PersonMergeSnapshotStaleError>
}
