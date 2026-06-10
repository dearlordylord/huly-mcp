interface NonEmptyTextSchema<A extends string> {
  readonly make: (value: string) => A
}

/**
 * Huly SDK title/name fields are plain strings and some models can contain
 * legacy/API-created blanks. MCP outputs that promise a non-empty domain value
 * normalize those blanks here instead of leaking "" or failing validation.
 */
export const hulyNonEmptyTextOrFallback = <A extends string>(
  schema: NonEmptyTextSchema<A>,
  value: string | null | undefined,
  fallback: A
): A => {
  const trimmed = value?.trim() ?? ""
  return trimmed === "" ? fallback : schema.make(trimmed)
}
