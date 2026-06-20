import { Schema } from "effect"

export const optionalOutput = <A, I, R>(
  schema: Schema.Schema<A, I, R>
): Schema.optionalWith<Schema.Schema<A, I, R>, { readonly exact: true }> => Schema.optionalWith(schema, { exact: true })
