import * as PersonSchemas from "../../domain/schemas/person-administration.js"
import * as PersonMergeSchemas from "../../domain/schemas/person-merge.js"
import { HULY_NATIVE_REFERENCE_MARKDOWN_INPUT } from "../../domain/schemas.js"
import {
  addPersonAttachment,
  deletePersonAttachment,
  getPersonAttachment,
  listPersonAttachments,
  updatePersonAttachment
} from "../../huly/operations/person-attachments.js"
import {
  getPersonAdministration,
  listSocialIdentityProviders,
  mergePeople,
  repairPersonSocialIdentities
} from "../../huly/operations/person-administration.js"
import {
  addPersonComment,
  deletePersonComment,
  listPersonComments,
  updatePersonComment
} from "../../huly/operations/person-comments.js"
import { defineCombinedTool, defineHulyWorkspaceTool, defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "contacts" as const
const EXACT_PERSON =
  "person must contain exactly one exact locator: {id}, {email}, or {name}; duplicate email/name matches fail as ambiguous."
const EXACT_MERGE_PEOPLE =
  "source and survivor must each contain exactly one exact locator: {id}, {email}, or {name}; duplicate email/name matches fail as ambiguous."

export const personAdministrationTools = [
  defineHulyWorkspaceTool(
    {
      name: "merge_people",
      description: `Preview or execute a native-reference-preserving person merge with an explicitly selected source and survivor; ${EXACT_MERGE_PEOPLE} Preview is the default and reports identities, channels, memberships, comments, attachments, every other model-declared Person/Contact/Employee reference, account eligibility, retained scalar fields, and an exact preflight token bound to canonical affected document IDs, write-routing fields, and scalar/array values. Execution requires execute=true plus that current token, rejects any snapshot drift before writing, rewires scalar and array references without dropping other array members, and invokes Huly's global Person merge when applicable. The source workspace Person record is retained because Huly's native merge does not cascade-delete it.`,
      category: CATEGORY,
      inputSchema: PersonMergeSchemas.mergePeopleParamsJsonSchema,
      resultSchema: PersonMergeSchemas.MergePeopleResultSchema,
      annotations: { destructiveHint: true }
    },
    PersonMergeSchemas.parseMergePeopleParams,
    mergePeople
  ),
  defineHulyWorkspaceTool(
    {
      name: "get_person_administration",
      description: `Inspect one person's identity and profile administration surface; ${EXACT_PERSON} Returns contact statuses, workspace membership, avatar metadata, birthday, social identities, account profile, channel activity, and an explicit stable-field support ledger.`,
      category: CATEGORY,
      inputSchema: PersonSchemas.getPersonAdministrationParamsJsonSchema,
      resultSchema: PersonSchemas.GetPersonAdministrationResultSchema
    },
    PersonSchemas.parseGetPersonAdministrationParams,
    getPersonAdministration
  ),
  defineTool(
    {
      name: "list_social_identity_providers",
      description:
        "List SocialIdentity providers installed in this Huly workspace, returning native provider IDs and types.",
      category: CATEGORY,
      inputSchema: PersonSchemas.listSocialIdentityProvidersParamsJsonSchema,
      resultSchema: PersonSchemas.ListSocialIdentityProvidersResultSchema
    },
    PersonSchemas.parseListSocialIdentityProvidersParams,
    listSocialIdentityProviders
  ),
  defineHulyWorkspaceTool(
    {
      name: "repair_person_social_identities",
      description: `Apply only Huly's native safe, idempotent SocialIdentity repairs from the authenticated person's authoritative account record: recreate missing active projections, promote verification, reassign an unverified identity after an account merge, and propagate authoritative deletion; ${EXACT_PERSON} Another account-linked person, verified cross-person reassignment, arbitrary active type/value/key changes, removal of workspace-only identities, and key collisions return a Huly-specific unsupported reason instead of being overwritten.`,
      category: CATEGORY,
      inputSchema: PersonSchemas.repairPersonSocialIdentitiesParamsJsonSchema,
      resultSchema: PersonSchemas.RepairPersonSocialIdentitiesResultSchema,
      annotations: { idempotentHint: true }
    },
    PersonSchemas.parseRepairPersonSocialIdentitiesParams,
    repairPersonSocialIdentities
  ),
  defineTool(
    {
      name: "list_person_comments",
      description: `List notes/comments genuinely attached to one person, oldest first; ${EXACT_PERSON}`,
      category: CATEGORY,
      inputSchema: PersonSchemas.listPersonCommentsParamsJsonSchema,
      resultSchema: PersonSchemas.ListPersonCommentsResultSchema
    },
    PersonSchemas.parseListPersonCommentsParams,
    listPersonComments
  ),
  defineTool(
    {
      name: "add_person_comment",
      description: `Add a markdown note/comment to one person; ${EXACT_PERSON} ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`,
      category: CATEGORY,
      inputSchema: PersonSchemas.addPersonCommentParamsJsonSchema,
      resultSchema: PersonSchemas.AddPersonCommentResultSchema
    },
    PersonSchemas.parseAddPersonCommentParams,
    addPersonComment
  ),
  defineTool(
    {
      name: "update_person_comment",
      description: `Idempotently update a note/comment belonging to one resolved person; ${EXACT_PERSON} ${HULY_NATIVE_REFERENCE_MARKDOWN_INPUT}`,
      category: CATEGORY,
      inputSchema: PersonSchemas.updatePersonCommentParamsJsonSchema,
      resultSchema: PersonSchemas.UpdatePersonCommentResultSchema,
      annotations: { idempotentHint: true }
    },
    PersonSchemas.parseUpdatePersonCommentParams,
    updatePersonComment
  ),
  defineTool(
    {
      name: "delete_person_comment",
      description: `Permanently delete a note/comment only when it belongs to one resolved person; ${EXACT_PERSON}`,
      category: CATEGORY,
      inputSchema: PersonSchemas.deletePersonCommentParamsJsonSchema,
      resultSchema: PersonSchemas.DeletePersonCommentResultSchema,
      annotations: { destructiveHint: true }
    },
    PersonSchemas.parseDeletePersonCommentParams,
    deletePersonComment
  ),
  defineTool(
    {
      name: "list_person_attachments",
      description: `List attachments genuinely attached to one person; ${EXACT_PERSON}`,
      category: CATEGORY,
      inputSchema: PersonSchemas.listPersonAttachmentsParamsJsonSchema,
      resultSchema: PersonSchemas.ListPersonAttachmentsResultSchema
    },
    PersonSchemas.parseListPersonAttachmentsParams,
    listPersonAttachments
  ),
  defineCombinedTool(
    {
      name: "add_person_attachment",
      description: `Upload and attach a file to one person from exactly one of filePath, fileUrl, or base64 data; ${EXACT_PERSON}`,
      category: CATEGORY,
      inputSchema: PersonSchemas.addPersonAttachmentParamsJsonSchema,
      resultSchema: PersonSchemas.AddPersonAttachmentResultSchema
    },
    PersonSchemas.parseAddPersonAttachmentParams,
    addPersonAttachment
  ),
  defineCombinedTool(
    {
      name: "get_person_attachment",
      description: `Get an attachment only when it belongs to one resolved person; ${EXACT_PERSON}`,
      category: CATEGORY,
      inputSchema: PersonSchemas.getPersonAttachmentParamsJsonSchema,
      resultSchema: PersonSchemas.GetPersonAttachmentResultSchema
    },
    PersonSchemas.parseGetPersonAttachmentParams,
    getPersonAttachment
  ),
  defineTool(
    {
      name: "update_person_attachment",
      description: `Update description or pinned state only when the attachment belongs to one resolved person; ${EXACT_PERSON}`,
      category: CATEGORY,
      inputSchema: PersonSchemas.updatePersonAttachmentParamsJsonSchema,
      resultSchema: PersonSchemas.UpdatePersonAttachmentResultSchema,
      annotations: { idempotentHint: true }
    },
    PersonSchemas.parseUpdatePersonAttachmentParams,
    updatePersonAttachment
  ),
  defineTool(
    {
      name: "delete_person_attachment",
      description: `Permanently delete an attachment only when it belongs to one resolved person; ${EXACT_PERSON}`,
      category: CATEGORY,
      inputSchema: PersonSchemas.deletePersonAttachmentParamsJsonSchema,
      resultSchema: PersonSchemas.DeletePersonAttachmentResultSchema,
      annotations: { destructiveHint: true }
    },
    PersonSchemas.parseDeletePersonAttachmentParams,
    deletePersonAttachment
  )
] as const satisfies ReadonlyArray<RegisteredTool>
