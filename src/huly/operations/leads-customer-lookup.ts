import type { Contact, Organization } from "@hcengineering/contact"
import type { Ref } from "@hcengineering/core"
import { Effect } from "effect"

import type { HulyClient, HulyClientError } from "../client.js"
import { contact } from "../huly-plugins.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

export type HulyLeadCustomerDocument = Contact | Organization

/** Read the authoritative Contact projection first, with the legacy Organization class as fallback. */
export const findLeadCustomerDocument = Effect.fn("Lead.findLeadCustomerDocument")(function* (
  client: HulyClient["Service"],
  customerId: Ref<Contact>
): Effect.fn.Return<HulyLeadCustomerDocument | undefined, HulyClientError> {
  const contactCustomer = yield* client.findOne<Contact>(contact.class.Contact, hulyQuery<Contact>({ _id: customerId }))
  if (contactCustomer !== undefined) return contactCustomer

  return yield* client.findOne<Organization>(
    contact.class.Organization,
    hulyQuery<Organization>({ _id: toRef<Organization>(customerId) })
  )
})
