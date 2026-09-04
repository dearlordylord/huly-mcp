import type { Employee, SocialIdentity } from "@hcengineering/contact"
import type { Staff } from "@hcengineering/hr"
import { Schema, SchemaIssue } from "effect"

import { DepartmentId } from "../src/domain/schemas/hr-departments.js"
import { PersonId } from "../src/domain/schemas/shared.js"
import { contact, hr } from "../src/huly/huly-plugins.js"
import { hulyQuery } from "../src/huly/operations/query-helpers.js"
import { toRef, toSocialIdentityRef } from "../src/huly/operations/sdk-boundary.js"
import { connectIntegrationHuly } from "./integration-huly-client.js"

const FixtureSchema = Schema.Struct({ employeeId: PersonId, departmentId: Schema.optionalKey(DepartmentId) })

const main = async (): Promise<string> => {
  const { client, primarySocialId } = await connectIntegrationHuly()
  try {
    const identity = await client.findOne<SocialIdentity>(
      contact.class.SocialIdentity,
      hulyQuery<SocialIdentity>({ _id: toSocialIdentityRef(primarySocialId) })
    )
    if (identity === undefined) throw new Error(`Primary social identity '${primarySocialId}' was not found`)
    const employee = await client.findOne<Employee>(
      contact.mixin.Employee,
      hulyQuery<Employee>({ _id: toRef<Employee>(identity.attachedTo) })
    )
    if (employee === undefined) throw new Error(`Authenticated person '${identity.attachedTo}' is not an employee`)
    const staff = await client.findOne<Staff>(hr.mixin.Staff, hulyQuery<Staff>({ _id: toRef<Staff>(employee._id) }))
    const departmentId =
      staff?.department === undefined || staff.department === null || staff.department === hr.ids.Head
        ? undefined
        : DepartmentId.make(staff.department)
    return JSON.stringify(
      Schema.encodeUnknownSync(FixtureSchema)({
        employeeId: PersonId.make(employee._id),
        ...(departmentId === undefined ? {} : { departmentId })
      })
    )
  } finally {
    await client.close()
  }
}

void main().then(
  (output) => {
    // eslint-disable-next-line no-console -- stdout is this integration helper's JSON result boundary.
    console.log(output)
  },
  (error: unknown) => {
    // eslint-disable-next-line no-console -- stderr is this integration helper's failure boundary.
    console.error(Schema.isSchemaError(error) ? SchemaIssue.makeFormatterDefault()(error.issue) : error)
    process.exitCode = 1
  }
)
