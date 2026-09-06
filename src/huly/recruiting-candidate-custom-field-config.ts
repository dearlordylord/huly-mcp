import { ObjectClassName } from "../domain/schemas/shared.js"
import { contact } from "./huly-plugins.js"
import { recruitIds } from "./recruit-plugin.js"

/** The only Huly owners exposed by Recruiting Candidate custom-field tools. */
export const RECRUITING_CANDIDATE_CUSTOM_FIELD_CANDIDATE_OWNER_ID = ObjectClassName.make(
  String(recruitIds.mixin.Candidate)
)
export const RECRUITING_CANDIDATE_CUSTOM_FIELD_PERSON_OWNER_ID = ObjectClassName.make(String(contact.class.Person))
export const RECRUITING_CANDIDATE_CUSTOM_FIELD_OWNER_IDS = [
  RECRUITING_CANDIDATE_CUSTOM_FIELD_CANDIDATE_OWNER_ID,
  RECRUITING_CANDIDATE_CUSTOM_FIELD_PERSON_OWNER_ID
] as const
export const RECRUITING_CANDIDATE_CUSTOM_FIELD_OWNER_DESCRIPTION = `${RECRUITING_CANDIDATE_CUSTOM_FIELD_CANDIDATE_OWNER_ID} or ${RECRUITING_CANDIDATE_CUSTOM_FIELD_PERSON_OWNER_ID}`
