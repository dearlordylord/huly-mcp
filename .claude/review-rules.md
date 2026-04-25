# Code Review Rules

Code review agents must check all items below. These are nitpick-level quality gates — enforce strictly.

## Comments

- No comments that repeat the code. If the code says what it does, a comment saying the same thing is noise.
- Cast justifications must be technically accurate (see Type Safety below).

## Dead Code

Every function, type, and export must have at least one call site at time of writing. No code "for future use" unless explicitly requested.

## Tests

Don't write tests that only verify compile-time guarantees (type assignments, interface conformance). If the compiler checks it, a test adds nothing.

## Type Safety — Cast Review Checklist

For every `as T` cast, verify:
1. Comment explains WHY the cast is necessary
2. Evidence/API docs support the cast being safe
3. A generic type parameter or type guard couldn't eliminate the cast

## TypeScript Type-System Terminology

Branded types (phantom types, opaque types) are compile-time only constructs — erased during transpilation. Common errors to catch:
- "branded at runtime" — oxymoron. At runtime they're plain strings/numbers/etc.
- "branded strings over the same runtime value" — brands don't exist at runtime; say "brands erased at runtime; both are plain strings"
- Cast justifications that imply brands have runtime meaning

Correct pattern: "Brands erased at runtime; both are `string`, so the cast is safe."

## State Space Minimality

For every product type (interface, type alias, Schema struct), verify: can every combination of field values occur in practice? If not, restructure to eliminate impossible states (discriminated union, nested types, `Option` instead of sentinel values). Symptoms:
- `""` / `0` / `null` meaning "not applicable" (sentinel values)
- Boolean alongside fields only meaningful when true/false
- Optional fields that must all be present-or-absent together
- Discriminated union variants carrying fields that only apply to some variants at the product level

## Connascence

Review every changed literal, branch condition, helper boundary, narrowed type, protocol step, and duplicated rule for connascence: code facts that must change together for correctness.

Flag distant or high-degree connascence, especially:
- magic strings/numbers whose validity depends on a separate parser, support gate, schema, protocol, SDK convention, or test fixture
- tuple/array index assumptions instead of named fields
- duplicated validation, projection, encoding, decoding, or execution algorithms
- downstream code manually remembering what an upstream narrowing helper or schema already proved
- caller protocols requiring operations in a specific order when a single API or state-typed API could encode the sequence
- duplicated default values, initial state, status meanings, or sentinel semantics

Required reviewer questions:
1. What must change together if this line changes?
2. Is that coupling local and obvious, or distant and implicit?
3. Is the coupling weak enough for its distance? If not, require a refactor.

Preferred fixes:
- replace magic values with named constants, literal unions, branded/domain types, or derived values
- replace positional conventions with records or named fields
- centralize duplicated algorithms behind one implementation
- pass narrowed/domain-specific values forward instead of rechecking or reinterpreting primitives
- colocate unavoidable strong connascence in one helper/module named after the domain invariant

Do not accept comments as the only fix when the relationship can be encoded in types, schemas, constants, or helper structure.

## Boundary Typing

All data crossing system boundaries (APIs, etc.) must be strongly typed — both inbound (decoding) and outbound (encoding), with Effect Schema. Flag any `any`, untyped fetch results, or raw JSON access.

## No Bare Primitives for Domain Values

Function signatures and type definitions must never use bare `string`, `number`, or `boolean` where a domain-specific type (union, branded, alias) exists or should exist. This applies to return types, parameters, map key/value types, schema fields, and struct fields.

Examples:
- A function returning `"ChPending" | "ChRunning" | "ChCompleted" | "ChFailed"` must have that union (or a named alias like `DagChildStatus`) as return type, not `string`
- A function producing node IDs must return `DagNodeId`, not `string`
- A timestamp field must use `number` only if no branded type like `Millis` exists; if one does, use it

Symptoms to flag:
- `(s: DomainType): string` — return type loses domain information
- `ReadonlyMap<string, string>` where keys or values have known finite domains
- `Schema.String` in schemas where the field has a known set of valid values (use `Schema.Literals`)
- Bare `number` for quantities that have units or domain meaning (timestamps, indices, counts) when a branded/alias type exists
- Type-narrowing helper that accepts a primitive and returns a type guard — the input might be unavoidable (external data), but document why
- If a suitable brand or alias already exists in `src/domain/schemas/shared.ts`, reuse it before creating a new type

## Immutability

No `let` for conditional assignment. Use `const` with:
- Ternary for single-variable branches
- Destructured struct (inline or extracted function) for multi-variable branches
- `yield* Effect.gen(function* () { ... })` when a branch needs effectful computation

Legitimate mutation (accumulators, state flags) must be justified by context — flag if unclear.
