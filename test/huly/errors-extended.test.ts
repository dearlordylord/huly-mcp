import { describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { expect } from "vitest"
import { AssociationName } from "../../src/domain/schemas/generic-associations.js"
import { ProcessExecutionId, ProcessId } from "../../src/domain/schemas/processes.js"
import {
  AssociationId,
  Count,
  DocId,
  MasterTagId,
  NonEmptyString,
  ObjectClassName,
  RelationId,
  UNKNOWN_TOTAL
} from "../../src/domain/schemas/shared.js"
import {
  AssociationConflictError,
  AssociationIdentifierAmbiguousError,
  AssociationInUseError,
  AssociationSystemClassUnsupportedError,
  CardNotFoundError,
  CardSpaceNotFoundError,
  CustomFieldNotFoundError,
  CustomFieldObjectNotFoundError,
  DocumentContentCorruptedError,
  DocumentEditModeError,
  DocumentEmptyContentError,
  DocumentTextMultipleMatchesError,
  DocumentTextNotFoundError,
  GenericObjectNotFoundError,
  type HulyDomainError,
  HulyDomainError as HulyDomainErrorSchema,
  MasterTagNotFoundError,
  NoUpdateFieldsError,
  ProcessExecutionNotCancellableError,
  ProcessExecutionNotFoundError,
  ProcessInitialStateNotFoundError,
  ProcessNotFoundError,
  RelationCardinalityViolationError,
  RelationDirectionAmbiguousError,
  RelationMutationUnsupportedError,
  TestCaseNotFoundError,
  TestPlanItemNotFoundError,
  TestPlanNotFoundError,
  TestProjectNotFoundError,
  TestResultNotFoundError,
  TestRunNotFoundError,
  TestSuiteNotFoundError
} from "../../src/huly/errors.js"

/**
 * Extended coverage for the `get message()` getters on the domain error
 * classes that are live (re-exported via the errors barrel and used in
 * operation error channels) but whose message getters were never exercised by
 * the existing suites — those constructed errors and read `.identifier`, not
 * `.message`. Each case asserts the exact rendered message; branch variants
 * (optional fields present/absent, empty/non-empty collections) are listed as
 * separate rows so every branch in the getter is taken.
 */
interface MessageCase {
  readonly error: HulyDomainError
  readonly tag: string
  readonly message: string
}

const assertMessages = (cases: ReadonlyArray<MessageCase>) =>
  Effect.gen(function*() {
    for (const { error, message, tag } of cases) {
      expect(error._tag).toBe(tag)
      expect(error.message).toBe(message)
    }
  })

describe("Extended Huly error message getters", () => {
  it.effect("errors-base: NoUpdateFieldsError", () =>
    assertMessages([
      {
        error: new NoUpdateFieldsError({ operation: "update_card", fields: ["title", "content"] }),
        tag: "NoUpdateFieldsError",
        message: "update_card requires at least one update field: title, content"
      }
    ]))

  it.effect("errors-cards", () =>
    assertMessages([
      {
        error: new CardSpaceNotFoundError({ identifier: "my-space" }),
        tag: "CardSpaceNotFoundError",
        message: "Card space 'my-space' not found"
      },
      {
        error: new CardNotFoundError({ identifier: "CARD-1", cardSpace: "my-space" }),
        tag: "CardNotFoundError",
        message: "Card 'CARD-1' not found in card space 'my-space'"
      },
      {
        error: new MasterTagNotFoundError({ identifier: "Bug", cardSpace: "my-space" }),
        tag: "MasterTagNotFoundError",
        message: "Master tag 'Bug' not found in card space 'my-space'"
      }
    ]))

  it.effect("errors-custom-fields", () =>
    assertMessages([
      {
        error: new CustomFieldNotFoundError({ identifier: "priority" }),
        tag: "CustomFieldNotFoundError",
        message: "Custom field 'priority' not found"
      },
      {
        error: new CustomFieldObjectNotFoundError({
          objectId: DocId.make("obj-1"),
          objectClass: ObjectClassName.make("tracker:class:Issue")
        }),
        tag: "CustomFieldObjectNotFoundError",
        message: "Object 'obj-1' of class 'tracker:class:Issue' not found"
      }
    ]))

  it.effect("errors-test-management", () =>
    assertMessages([
      {
        error: new TestProjectNotFoundError({ identifier: "TP" }),
        tag: "TestProjectNotFoundError",
        message: "Test project 'TP' not found"
      },
      {
        error: new TestSuiteNotFoundError({ identifier: "TS" }),
        tag: "TestSuiteNotFoundError",
        message: "Test suite 'TS' not found"
      },
      {
        error: new TestCaseNotFoundError({ identifier: "TC" }),
        tag: "TestCaseNotFoundError",
        message: "Test case 'TC' not found"
      },
      {
        error: new TestPlanNotFoundError({ identifier: "PLAN" }),
        tag: "TestPlanNotFoundError",
        message: "Test plan 'PLAN' not found"
      },
      {
        error: new TestRunNotFoundError({ identifier: "RUN" }),
        tag: "TestRunNotFoundError",
        message: "Test run 'RUN' not found"
      },
      {
        error: new TestResultNotFoundError({ identifier: "RES" }),
        tag: "TestResultNotFoundError",
        message: "Test result 'RES' not found"
      },
      {
        error: new TestPlanItemNotFoundError({ identifier: "item-1", plan: "PLAN-1" }),
        tag: "TestPlanItemNotFoundError",
        message: "Test plan item 'item-1' not found in plan 'PLAN-1'"
      }
    ]))

  it.effect("errors-documents", () =>
    assertMessages([
      {
        error: new DocumentTextNotFoundError({ searchText: "foo" }),
        tag: "DocumentTextNotFoundError",
        message: "String to replace not found in document.\nString: foo"
      },
      {
        error: new DocumentTextMultipleMatchesError({ searchText: "bar", matchCount: Count.make(3) }),
        tag: "DocumentTextMultipleMatchesError",
        message: "Found 3 matches of the string to replace, but replace_all is false. "
          + "To replace all occurrences, set replace_all to true. "
          + "To replace only one occurrence, provide more context to uniquely identify the instance.\n"
          + "String: bar"
      },
      {
        error: new DocumentEmptyContentError({ identifier: "doc-1" }),
        tag: "DocumentEmptyContentError",
        message: "Document 'doc-1' has no content. Use 'content' mode or create_document to set initial content."
      },
      {
        error: new DocumentContentCorruptedError({ identifier: "doc-1", causeMessage: "missing markup blob" }),
        tag: "DocumentContentCorruptedError",
        message:
          "Document content is unreadable or corrupted. Use edit_document with the full content field to replace and repair it."
      },
      {
        error: new DocumentEditModeError({ reason: "mixed modes" }),
        tag: "DocumentEditModeError",
        message: "Invalid edit_document mode: mixed modes"
      }
    ]))

  it.effect("errors-generic-associations (message branches)", () =>
    assertMessages([
      {
        error: new AssociationSystemClassUnsupportedError({
          className: ObjectClassName.make("core:class:Doc"),
          operation: "create_relation"
        }),
        tag: "AssociationSystemClassUnsupportedError",
        message: "create_relation does not support core system class 'core:class:Doc' in generic association writes."
      },
      {
        error: new AssociationConflictError({
          associationId: AssociationId.make("assoc-1"),
          reason: "different cardinality"
        }),
        tag: "AssociationConflictError",
        message:
          "Association 'assoc-1' already exists but conflicts with the requested definition: different cardinality."
      },
      {
        // sampleRelationIds non-empty branch
        error: new AssociationInUseError({
          associationId: AssociationId.make("assoc-1"),
          relationCount: Count.make(2),
          sampleRelationIds: [RelationId.make("rel-1"), RelationId.make("rel-2")]
        }),
        tag: "AssociationInUseError",
        message:
          "Association 'assoc-1' cannot be deleted because 2 relation(s) still reference it. Delete those relations first. Sample relation IDs: rel-1, rel-2."
      },
      {
        // sampleRelationIds empty branch
        error: new AssociationInUseError({
          associationId: AssociationId.make("assoc-2"),
          relationCount: Count.make(0),
          sampleRelationIds: []
        }),
        tag: "AssociationInUseError",
        message:
          "Association 'assoc-2' cannot be deleted because 0 relation(s) still reference it. Delete those relations first."
      },
      {
        error: new AssociationInUseError({
          associationId: AssociationId.make("assoc-3"),
          relationCount: UNKNOWN_TOTAL,
          sampleRelationIds: [RelationId.make("rel-3")]
        }),
        tag: "AssociationInUseError",
        message:
          "Association 'assoc-3' cannot be deleted because an unknown number of relations still reference it. Delete those relations first. Sample relation IDs: rel-3."
      },
      {
        error: new RelationCardinalityViolationError({
          associationId: AssociationId.make("assoc-1"),
          cardinality: "one-to-one",
          reason: "already linked"
        }),
        tag: "RelationCardinalityViolationError",
        message: "Relation violates one-to-one cardinality for association 'assoc-1': already linked."
      },
      {
        error: new RelationDirectionAmbiguousError({
          associationId: AssociationId.make("assoc-1"),
          reason: "same class"
        }),
        tag: "RelationDirectionAmbiguousError",
        message:
          "Relation direction is ambiguous for association 'assoc-1': same class. Use source-to-target or target-to-source."
      },
      {
        // associationId present branch
        error: new RelationMutationUnsupportedError({
          associationId: AssociationId.make("assoc-9"),
          reason: "frozen"
        }),
        tag: "RelationMutationUnsupportedError",
        message:
          "Generic relation mutation for association 'assoc-9' is not supported: frozen. Call list_associations with writableOnly=true to discover writable associations."
      },
      {
        // associationId absent branch
        error: new RelationMutationUnsupportedError({ reason: "not validated" }),
        tag: "RelationMutationUnsupportedError",
        message:
          "Generic relation mutation is not supported: not validated. Call list_associations with writableOnly=true to discover writable associations."
      },
      {
        // class absent branch
        error: new GenericObjectNotFoundError({ field: "source", identifier: "missing" }),
        tag: "GenericObjectNotFoundError",
        message: "Object locator 'source' for 'missing' not found."
      },
      {
        // formatCandidates: name+classes, no name+no classes, name+partial classes
        error: new AssociationIdentifierAmbiguousError({
          identifier: "links",
          candidates: [
            {
              id: AssociationId.make("assoc-1"),
              name: AssociationName.make("relates"),
              sourceClass: ObjectClassName.make("tracker:class:Issue"),
              targetClass: ObjectClassName.make("document:class:Document")
            },
            { id: AssociationId.make("assoc-2") },
            {
              id: AssociationId.make("assoc-3"),
              name: AssociationName.make("partial"),
              sourceClass: ObjectClassName.make("x:class:A")
            }
          ]
        }),
        tag: "AssociationIdentifierAmbiguousError",
        message:
          "Association 'links' matched multiple definitions: relates (assoc-1 tracker:class:Issue -> document:class:Document); (assoc-2); partial (assoc-3). Call list_associations with sourceClass and targetClass to choose one."
      }
    ]))

  it.effect("errors-processes (message branches)", () =>
    assertMessages([
      {
        error: new ProcessInitialStateNotFoundError({
          processId: ProcessId.make("proc-1"),
          processName: NonEmptyString.make("Approval")
        }),
        tag: "ProcessInitialStateNotFoundError",
        message: "Process 'Approval' (proc-1) has no initial transition from null"
      },
      {
        error: new ProcessExecutionNotFoundError({ executionId: ProcessExecutionId.make("exec-1") }),
        tag: "ProcessExecutionNotFoundError",
        message: "Process execution 'exec-1' not found"
      },
      {
        error: new ProcessExecutionNotCancellableError({
          executionId: ProcessExecutionId.make("exec-2"),
          status: "done"
        }),
        tag: "ProcessExecutionNotCancellableError",
        message: "Process execution 'exec-2' is completed and cannot be cancelled"
      },
      {
        // empty candidates branch
        error: new ProcessNotFoundError({ identifier: "Missing", candidates: [] }),
        tag: "ProcessNotFoundError",
        message: "Process 'Missing' not found."
      },
      {
        // candidateList masterTagName-absent branch
        error: new ProcessNotFoundError({
          identifier: "Approval",
          candidates: [
            {
              id: ProcessId.make("proc-2"),
              name: NonEmptyString.make("Review"),
              masterTagId: MasterTagId.make("card:type:Doc")
            }
          ]
        }),
        tag: "ProcessNotFoundError",
        message: "Process 'Approval' not found. Available processes: Review (proc-2, masterTag card:type:Doc)"
      }
    ]))

  it.effect("every extended error round-trips through the HulyDomainError union schema", () =>
    Effect.gen(function*() {
      const samples: ReadonlyArray<HulyDomainError> = [
        new NoUpdateFieldsError({ operation: "update_card", fields: ["title"] }),
        new CardNotFoundError({ identifier: "CARD-1", cardSpace: "my-space" }),
        new CustomFieldObjectNotFoundError({
          objectId: DocId.make("obj-1"),
          objectClass: ObjectClassName.make("tracker:class:Issue")
        }),
        new TestResultNotFoundError({ identifier: "RES" }),
        new DocumentEditModeError({ reason: "mixed modes" }),
        new AssociationInUseError({
          associationId: AssociationId.make("assoc-1"),
          relationCount: Count.make(1),
          sampleRelationIds: [RelationId.make("rel-1")]
        }),
        new ProcessExecutionNotFoundError({ executionId: ProcessExecutionId.make("exec-1") }),
        new DocumentContentCorruptedError({ identifier: "doc-1" })
      ]

      for (const sample of samples) {
        const encoded = yield* Schema.encode(HulyDomainErrorSchema)(sample)
        const decoded = yield* Schema.decode(HulyDomainErrorSchema)(encoded)
        expect(decoded._tag).toBe(sample._tag)
      }
    }))
})
