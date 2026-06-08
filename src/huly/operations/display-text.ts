interface NonEmptyDisplayTextSchema<A extends string> {
  readonly make: (value: string) => A
}

/**
 * Huly SDK display fields are plain strings even when the UI normally requires
 * a visible label. MCP outputs that promise non-empty labels should normalize
 * legacy/API-created blanks here instead of leaking "" or failing validation.
 */
export const hulyDisplayTextOrFallback = <A extends string>(
  schema: NonEmptyDisplayTextSchema<A>,
  value: string | null | undefined,
  fallback: A
): A => {
  const trimmed = value?.trim() ?? ""
  return trimmed === "" ? fallback : schema.make(trimmed)
}
